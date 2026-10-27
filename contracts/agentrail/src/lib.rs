#![no_std]
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, Address, Env, String, Symbol,
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
    AllowanceNotFound = 4,
    AllowanceExpired = 5,
    AllowanceExceeded = 6,
    AllowanceInactive = 7,
    InvalidAmount = 8,
    InvalidFeeBps = 9,
    ContractPaused = 10,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ScopedAllowance {
    pub owner: Address,
    pub agent: Address,
    pub max_stroops: i128,
    pub spent_stroops: i128,
    pub valid_until: u64,
    pub active: bool,
}

#[contracttype]
pub enum DataKey {
    Admin,
    Token,
    Treasury,
    ProtocolFeeBps,
    Paused,
    Allowance(Address, Address), // (Owner, Agent)
}

const ALLOWANCE_EVENT: Symbol = symbol_short!("allowance");
const SPEND_EVENT: Symbol = symbol_short!("spend");
const FEE_EVENT: Symbol = symbol_short!("fee");
const CIRCUIT_EVENT: Symbol = symbol_short!("circuit");

/// Maximum protocol fee is 500 bps (5.00%). Default is 20 bps (0.20%).
pub const MAX_FEE_BPS: u32 = 500;
pub const DEFAULT_FEE_BPS: u32 = 20;
pub const CONTRACT_VERSION: &str = env!("CARGO_PKG_VERSION");

#[contract]
pub struct AgentRailContract;

#[contractimpl]
impl AgentRailContract {
    /// Return the contract semver string matching Cargo.toml
    pub fn get_version(env: Env) -> String {
        String::from_str(&env, CONTRACT_VERSION)
    }

    /// Initialize the AgentRail Vault contract with an admin, settlement token (Circle USDC),
    /// treasury address for protocol monetization, and initial fee basis points.
    pub fn initialize(
        env: Env,
        admin: Address,
        token: Address,
        treasury: Address,
        fee_bps: u32,
    ) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(Error::AlreadyInitialized);
        }
        if fee_bps > MAX_FEE_BPS {
            return Err(Error::InvalidFeeBps);
        }

        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Token, &token);
        env.storage().instance().set(&DataKey::Treasury, &treasury);
        env.storage().instance().set(&DataKey::ProtocolFeeBps, &fee_bps);
        env.storage().instance().set(&DataKey::Paused, &false);
        Ok(())
    }

    /// Emergency Circuit Breaker: Freeze all spend transactions (requires admin auth).
    pub fn pause(env: Env) -> Result<(), Error> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)?;
        admin.require_auth();

        env.storage().instance().set(&DataKey::Paused, &true);
        env.events()
            .publish((CIRCUIT_EVENT, symbol_short!("pause")), (admin,));
        Ok(())
    }

    /// Unfreeze contract and restore spend execution (requires admin auth).
    pub fn unpause(env: Env) -> Result<(), Error> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)?;
        admin.require_auth();

        env.storage().instance().set(&DataKey::Paused, &false);
        env.events()
            .publish((CIRCUIT_EVENT, symbol_short!("unpause")), (admin,));
        Ok(())
    }

    /// Query current pause circuit breaker state.
    pub fn is_paused(env: Env) -> bool {
        env.storage().instance().get(&DataKey::Paused).unwrap_or(false)
    }

    /// Admin configuration to adjust protocol monetization fee & treasury address.
    pub fn set_protocol_fee(
        env: Env,
        treasury: Address,
        fee_bps: u32,
    ) -> Result<(), Error> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)?;
        admin.require_auth();

        if fee_bps > MAX_FEE_BPS {
            return Err(Error::InvalidFeeBps);
        }

        env.storage().instance().set(&DataKey::Treasury, &treasury);
        env.storage().instance().set(&DataKey::ProtocolFeeBps, &fee_bps);

        env.events()
            .publish((FEE_EVENT, symbol_short!("set")), (treasury, fee_bps));

        Ok(())
    }

    /// Retrieve the current protocol fee configuration: (treasury_address, fee_bps).
    pub fn get_protocol_fee(env: Env) -> Result<(Address, u32), Error> {
        let treasury: Address = env
            .storage()
            .instance()
            .get(&DataKey::Treasury)
            .ok_or(Error::NotInitialized)?;
        let fee_bps: u32 = env
            .storage()
            .instance()
            .get(&DataKey::ProtocolFeeBps)
            .unwrap_or(DEFAULT_FEE_BPS);
        Ok((treasury, fee_bps))
    }

    /// Grant a scoped allowance from a human owner to an autonomous AI agent keypair.
    pub fn grant_allowance(
        env: Env,
        owner: Address,
        agent: Address,
        max_stroops: i128,
        valid_until: u64,
    ) -> Result<(), Error> {
        owner.require_auth();

        if max_stroops <= 0 {
            return Err(Error::InvalidAmount);
        }

        let allowance = ScopedAllowance {
            owner: owner.clone(),
            agent: agent.clone(),
            max_stroops,
            spent_stroops: 0,
            valid_until,
            active: true,
        };

        let key = DataKey::Allowance(owner.clone(), agent.clone());
        env.storage().persistent().set(&key, &allowance);

        // Emit Soroban topic event for indexing
        env.events()
            .publish((ALLOWANCE_EVENT, symbol_short!("grant")), (owner, agent, max_stroops));

        Ok(())
    }

    /// Execute a micro-spend from an agent's active allowance.
    /// Calculates protocol fee routed to treasury and net amount to destination.
    pub fn execute_spend(
        env: Env,
        owner: Address,
        agent: Address,
        destination: Address,
        amount: i128,
    ) -> Result<(), Error> {
        // Enforce Circuit Breaker
        if Self::is_paused(env.clone()) {
            return Err(Error::ContractPaused);
        }

        agent.require_auth();

        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }

        let key = DataKey::Allowance(owner.clone(), agent.clone());
        let mut allowance: ScopedAllowance = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(Error::AllowanceNotFound)?;

        if !allowance.active {
            return Err(Error::AllowanceInactive);
        }

        let now = env.ledger().timestamp();
        if now > allowance.valid_until {
            return Err(Error::AllowanceExpired);
        }

        let new_spent = allowance.spent_stroops.checked_add(amount).ok_or(Error::AllowanceExceeded)?;
        if new_spent > allowance.max_stroops {
            return Err(Error::AllowanceExceeded);
        }

        allowance.spent_stroops = new_spent;
        env.storage().persistent().set(&key, &allowance);

        // Compute Protocol Fee monetization
        let fee_bps: u32 = env
            .storage()
            .instance()
            .get(&DataKey::ProtocolFeeBps)
            .unwrap_or(0);
        let fee_amount = if fee_bps > 0 {
            (amount * fee_bps as i128) / 10_000
        } else {
            0
        };
        let net_amount = amount - fee_amount;

        // Emit spend execution event
        env.events()
            .publish((SPEND_EVENT, symbol_short!("exec")), (agent, destination, net_amount));

        // If fee was deducted, emit fee event for treasury tracking
        if fee_amount > 0 {
            if let Some(treasury) = env.storage().instance().get::<DataKey, Address>(&DataKey::Treasury) {
                env.events()
                    .publish((FEE_EVENT, symbol_short!("route")), (treasury, fee_amount));
            }
        }

        Ok(())
    }

    /// Revoke an active allowance immediately (emergency stop).
    pub fn revoke_allowance(env: Env, owner: Address, agent: Address) -> Result<(), Error> {
        owner.require_auth();

        let key = DataKey::Allowance(owner.clone(), agent.clone());
        let mut allowance: ScopedAllowance = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(Error::AllowanceNotFound)?;

        allowance.active = false;
        env.storage().persistent().set(&key, &allowance);

        env.events()
            .publish((ALLOWANCE_EVENT, symbol_short!("revoke")), (owner, agent));

        Ok(())
    }

    /// Fetch allowance status
    pub fn get_allowance(env: Env, owner: Address, agent: Address) -> Option<ScopedAllowance> {
        let key = DataKey::Allowance(owner, agent);
        env.storage().persistent().get(&key)
    }
}

#[cfg(test)]
mod test;
