#![no_std]
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, Address, Env, Symbol,
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
    Allowance(Address, Address), // (Owner, Agent)
}

const ALLOWANCE_EVENT: Symbol = symbol_short!("allowance");
const SPEND_EVENT: Symbol = symbol_short!("spend");

#[contract]
pub struct AgentRailContract;

#[contractimpl]
impl AgentRailContract {
    /// Initialize the AgentRail Vault contract with an admin and settlement token (Circle USDC).
    pub fn initialize(env: Env, admin: Address, token: Address) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(Error::AlreadyInitialized);
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Token, &token);
        Ok(())
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
    pub fn execute_spend(
        env: Env,
        owner: Address,
        agent: Address,
        destination: Address,
        amount: i128,
    ) -> Result<(), Error> {
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

        // Emit spend execution event
        env.events()
            .publish((SPEND_EVENT, symbol_short!("exec")), (agent, destination, amount));

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
