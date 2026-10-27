#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    Address, Env, String,
};

fn setup_test(
    env: &Env,
) -> (
    AgentRailContractClient<'static>,
    Address, // admin
    Address, // token
    Address, // treasury
    Address, // owner
    Address, // agent
    Address, // destination
) {
    let contract_id = env.register(AgentRailContract, ());
    let client = AgentRailContractClient::new(env, &contract_id);

    let admin = Address::generate(env);
    let token = Address::generate(env);
    let treasury = Address::generate(env);
    let owner = Address::generate(env);
    let agent = Address::generate(env);
    let destination = Address::generate(env);

    (client, admin, token, treasury, owner, agent, destination)
}

// ─── 1. Version & Metadata Tests ───────────────────────────────────────────

#[test]
fn test_get_version_matches_cargo_toml() {
    let env = Env::default();
    let (client, _, _, _, _, _, _) = setup_test(&env);
    let version = client.get_version();
    let expected = String::from_str(&env, env!("CARGO_PKG_VERSION"));
    assert_eq!(version, expected);
}

#[test]
fn test_contract_version_constant() {
    assert_eq!(CONTRACT_VERSION, env!("CARGO_PKG_VERSION"));
    assert!(!CONTRACT_VERSION.is_empty());
}

// ─── 2. Critical: Initialization & Fee Invariants ─────────────────────────

#[test]
fn test_initialize_success() {
    let env = Env::default();
    let (client, admin, token, treasury, _, _, _) = setup_test(&env);

    client.initialize(&admin, &token, &treasury, &20);
    let (fee_treasury, fee_bps) = client.get_protocol_fee();
    assert_eq!(fee_treasury, treasury);
    assert_eq!(fee_bps, 20);
    assert_eq!(client.is_paused(), false);
}

#[test]
#[should_panic(expected = "Error(Contract, #1)")]
fn test_double_initialize_fails() {
    let env = Env::default();
    let (client, admin, token, treasury, _, _, _) = setup_test(&env);

    client.initialize(&admin, &token, &treasury, &20);
    // Second initialization must fail with AlreadyInitialized (#1)
    client.initialize(&admin, &token, &treasury, &20);
}

#[test]
#[should_panic(expected = "Error(Contract, #9)")]
fn test_initialize_with_excessive_fee_fails() {
    let env = Env::default();
    let (client, admin, token, treasury, _, _, _) = setup_test(&env);
    // Over MAX_FEE_BPS (500) must fail with InvalidFeeBps (#9)
    client.initialize(&admin, &token, &treasury, &501);
}

#[test]
fn test_set_protocol_fee_by_admin() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, token, treasury, _, _, _) = setup_test(&env);

    client.initialize(&admin, &token, &treasury, &20);
    let new_treasury = Address::generate(&env);
    client.set_protocol_fee(&new_treasury, &100);

    let (updated_treasury, updated_bps) = client.get_protocol_fee();
    assert_eq!(updated_treasury, new_treasury);
    assert_eq!(updated_bps, 100);
}

// ─── 3. Critical: Emergency Circuit Breaker (Pause/Unpause) ────────────────

#[test]
fn test_circuit_breaker_pause_and_unpause() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, token, treasury, _, _, _) = setup_test(&env);

    client.initialize(&admin, &token, &treasury, &20);
    assert_eq!(client.is_paused(), false);

    // Admin pauses contract
    client.pause();
    assert_eq!(client.is_paused(), true);

    // Admin unpauses contract
    client.unpause();
    assert_eq!(client.is_paused(), false);
}

#[test]
#[should_panic(expected = "Error(Contract, #10)")]
fn test_spend_fails_when_circuit_breaker_tripped() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, token, treasury, owner, agent, destination) = setup_test(&env);

    client.initialize(&admin, &token, &treasury, &20);
    client.grant_allowance(&owner, &agent, &10_000_000, &100_000);

    // Emergency pause triggered!
    client.pause();

    // Spend must immediately fail with ContractPaused (#10)
    client.execute_spend(&owner, &agent, &destination, &1_000_000);
}

// ─── 4. High: Scoped Allowance & Spend Verification ───────────────────────

#[test]
fn test_grant_allowance_success() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, token, treasury, owner, agent, _) = setup_test(&env);

    client.initialize(&admin, &token, &treasury, &20);
    client.grant_allowance(&owner, &agent, &50_000_000, &10_000);

    let allowance = client.get_allowance(&owner, &agent).unwrap();
    assert_eq!(allowance.owner, owner);
    assert_eq!(allowance.agent, agent);
    assert_eq!(allowance.max_stroops, 50_000_000);
    assert_eq!(allowance.spent_stroops, 0);
    assert_eq!(allowance.valid_until, 10_000);
    assert_eq!(allowance.active, true);
}

#[test]
#[should_panic(expected = "Error(Contract, #8)")]
fn test_grant_allowance_zero_amount_fails() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, token, treasury, owner, agent, _) = setup_test(&env);

    client.initialize(&admin, &token, &treasury, &20);
    client.grant_allowance(&owner, &agent, &0, &10_000);
}

#[test]
#[should_panic(expected = "Error(Contract, #8)")]
fn test_grant_allowance_negative_amount_fails() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, token, treasury, owner, agent, _) = setup_test(&env);

    client.initialize(&admin, &token, &treasury, &20);
    client.grant_allowance(&owner, &agent, &-500, &10_000);
}

#[test]
fn test_execute_spend_deducts_and_accumulates() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, token, treasury, owner, agent, destination) = setup_test(&env);

    client.initialize(&admin, &token, &treasury, &20);
    client.grant_allowance(&owner, &agent, &20_000_000, &100_000);

    // Spend 1: 5 USDC
    client.execute_spend(&owner, &agent, &destination, &5_000_000);
    let a1 = client.get_allowance(&owner, &agent).unwrap();
    assert_eq!(a1.spent_stroops, 5_000_000);

    // Spend 2: 10 USDC
    client.execute_spend(&owner, &agent, &destination, &10_000_000);
    let a2 = client.get_allowance(&owner, &agent).unwrap();
    assert_eq!(a2.spent_stroops, 15_000_000);
}

#[test]
fn test_spend_exact_allowance_boundary() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, token, treasury, owner, agent, destination) = setup_test(&env);

    client.initialize(&admin, &token, &treasury, &20);
    client.grant_allowance(&owner, &agent, &10_000_000, &100_000);

    // Spend exactly the full limit
    client.execute_spend(&owner, &agent, &destination, &10_000_000);
    let a = client.get_allowance(&owner, &agent).unwrap();
    assert_eq!(a.spent_stroops, 10_000_000);
}

#[test]
#[should_panic(expected = "Error(Contract, #6)")]
fn test_spend_exceeding_allowance_fails() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, token, treasury, owner, agent, destination) = setup_test(&env);

    client.initialize(&admin, &token, &treasury, &20);
    client.grant_allowance(&owner, &agent, &5_000_000, &100_000);

    // Attempting to spend 5.000001 USDC fails with AllowanceExceeded (#6)
    client.execute_spend(&owner, &agent, &destination, &5_000_001);
}

#[test]
#[should_panic(expected = "Error(Contract, #5)")]
fn test_spend_after_expiry_fails() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, token, treasury, owner, agent, destination) = setup_test(&env);

    client.initialize(&admin, &token, &treasury, &20);
    client.grant_allowance(&owner, &agent, &10_000_000, &500);

    // Fast-forward ledger timestamp past expiry
    env.ledger().set_timestamp(501);

    client.execute_spend(&owner, &agent, &destination, &1_000_000);
}

#[test]
#[should_panic(expected = "Error(Contract, #4)")]
fn test_spend_non_existent_allowance_fails() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, token, treasury, owner, agent, destination) = setup_test(&env);

    client.initialize(&admin, &token, &treasury, &20);
    client.execute_spend(&owner, &agent, &destination, &1_000_000);
}

// ─── 5. Critical: Revocation & Emergency Freeze ───────────────────────────

#[test]
fn test_revoke_allowance_freezes_spending() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, token, treasury, owner, agent, _) = setup_test(&env);

    client.initialize(&admin, &token, &treasury, &20);
    client.grant_allowance(&owner, &agent, &10_000_000, &100_000);

    // Owner revokes allowance
    client.revoke_allowance(&owner, &agent);

    let a = client.get_allowance(&owner, &agent).unwrap();
    assert_eq!(a.active, false);
}

#[test]
#[should_panic(expected = "Error(Contract, #7)")]
fn test_spend_on_revoked_allowance_fails() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, token, treasury, owner, agent, destination) = setup_test(&env);

    client.initialize(&admin, &token, &treasury, &20);
    client.grant_allowance(&owner, &agent, &10_000_000, &100_000);

    client.revoke_allowance(&owner, &agent);

    // Spend must fail with AllowanceInactive (#7)
    client.execute_spend(&owner, &agent, &destination, &1_000_000);
}

// ─── 6. High: Multi-Agent Isolation & Concurrency ─────────────────────────

#[test]
fn test_multi_agent_allowance_isolation() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, token, treasury, owner, agent1, destination) = setup_test(&env);
    let agent2 = Address::generate(&env);

    client.initialize(&admin, &token, &treasury, &20);

    // Grant 10 USDC to Agent 1, and 5 USDC to Agent 2
    client.grant_allowance(&owner, &agent1, &10_000_000, &100_000);
    client.grant_allowance(&owner, &agent2, &5_000_000, &100_000);

    // Agent 1 spends 6 USDC
    client.execute_spend(&owner, &agent1, &destination, &6_000_000);

    // Verify Agent 2 allowance balance is completely unaffected
    let a1 = client.get_allowance(&owner, &agent1).unwrap();
    let a2 = client.get_allowance(&owner, &agent2).unwrap();
    assert_eq!(a1.spent_stroops, 6_000_000);
    assert_eq!(a2.spent_stroops, 0);
}

#[test]
fn test_multi_owner_isolation() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, token, treasury, owner1, agent, destination) = setup_test(&env);
    let owner2 = Address::generate(&env);

    client.initialize(&admin, &token, &treasury, &20);

    // Owner 1 grants 10 USDC to agent, Owner 2 grants 20 USDC to agent
    client.grant_allowance(&owner1, &agent, &10_000_000, &100_000);
    client.grant_allowance(&owner2, &agent, &20_000_000, &100_000);

    // Agent spends 3 USDC from Owner 1
    client.execute_spend(&owner1, &agent, &destination, &3_000_000);

    let a1 = client.get_allowance(&owner1, &agent).unwrap();
    let a2 = client.get_allowance(&owner2, &agent).unwrap();
    assert_eq!(a1.spent_stroops, 3_000_000);
    assert_eq!(a2.spent_stroops, 0);
}

// ─── 7. Critical: Boundary Amounts & Fee Invariants ──────────────────────

#[test]
#[should_panic(expected = "Error(Contract, #8)")]
fn test_spend_zero_amount_fails() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, token, treasury, owner, agent, destination) = setup_test(&env);

    client.initialize(&admin, &token, &treasury, &20);
    client.grant_allowance(&owner, &agent, &10_000_000, &100_000);

    // 0 amount spend must fail with InvalidAmount (#8)
    client.execute_spend(&owner, &agent, &destination, &0);
}

#[test]
#[should_panic(expected = "Error(Contract, #8)")]
fn test_spend_negative_amount_fails() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, token, treasury, owner, agent, destination) = setup_test(&env);

    client.initialize(&admin, &token, &treasury, &20);
    client.grant_allowance(&owner, &agent, &10_000_000, &100_000);

    // Negative amount spend must fail with InvalidAmount (#8)
    client.execute_spend(&owner, &agent, &destination, &-10_000);
}

#[test]
fn test_regrant_allowance_updates_limits() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, token, treasury, owner, agent, destination) = setup_test(&env);

    client.initialize(&admin, &token, &treasury, &20);
    client.grant_allowance(&owner, &agent, &10_000_000, &100_000);
    client.execute_spend(&owner, &agent, &destination, &5_000_000);

    // Owner increases allowance to 50 USDC with new expiration
    client.grant_allowance(&owner, &agent, &50_000_000, &200_000);

    let updated = client.get_allowance(&owner, &agent).unwrap();
    assert_eq!(updated.max_stroops, 50_000_000);
    assert_eq!(updated.spent_stroops, 0);
    assert_eq!(updated.valid_until, 200_000);
}

#[test]
fn test_zero_protocol_fee_spend() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, token, treasury, owner, agent, destination) = setup_test(&env);

    // Initialized with 0 bps fee
    client.initialize(&admin, &token, &treasury, &0);
    client.grant_allowance(&owner, &agent, &10_000_000, &100_000);

    client.execute_spend(&owner, &agent, &destination, &5_000_000);
    let a = client.get_allowance(&owner, &agent).unwrap();
    assert_eq!(a.spent_stroops, 5_000_000);
}

#[test]
fn test_max_protocol_fee_spend_boundary() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, token, treasury, owner, agent, destination) = setup_test(&env);

    // Initialized with maximum 500 bps (5.00%) fee
    client.initialize(&admin, &token, &treasury, &MAX_FEE_BPS);
    client.grant_allowance(&owner, &agent, &100_000_000, &100_000);

    client.execute_spend(&owner, &agent, &destination, &10_000_000);
    let a = client.get_allowance(&owner, &agent).unwrap();
    assert_eq!(a.spent_stroops, 10_000_000);
}

#[test]
fn test_unpause_restores_spend_operations() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, token, treasury, owner, agent, destination) = setup_test(&env);

    client.initialize(&admin, &token, &treasury, &20);
    client.grant_allowance(&owner, &agent, &10_000_000, &100_000);

    // Trip circuit breaker
    client.pause();
    assert_eq!(client.is_paused(), true);

    // Untrip circuit breaker
    client.unpause();
    assert_eq!(client.is_paused(), false);

    // Spend succeeds after unpause
    client.execute_spend(&owner, &agent, &destination, &2_000_000);
    let a = client.get_allowance(&owner, &agent).unwrap();
    assert_eq!(a.spent_stroops, 2_000_000);
}

#[test]
fn test_get_allowance_returns_none_for_unregistered() {
    let env = Env::default();
    let (client, _, _, _, owner, agent, _) = setup_test(&env);
    assert!(client.get_allowance(&owner, &agent).is_none());
}
