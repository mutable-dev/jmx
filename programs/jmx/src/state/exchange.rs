use anchor_lang::prelude::*;

#[account]
#[derive(Default)]
pub struct Exchange {
	/// account that can make changes to the exchange
	pub name: [u8; 20],
	/// assets that can be traded/minted on the exchange
	pub assets: Vec<Pubkey>,
	/// fee for non-stable asset perp
	pub tax_basis_points: u64,
	/// fee for stable asset perp
	pub stable_tax_basis_points: u64,
	/// base fee for mint/burning lp token
	pub mint_burn_basis_points: u64,
	/// base fee for swap
	pub swap_fee_basis_points: u64,
	/// base fee for swaping between stable assets 
	pub stable_swap_fee_basis_points: u64, 
	/// references position fees, not for funding rate, nor for getting in/out of a position
	pub margin_fee_basis_points: u64, 
	/// fee for getting liquidated, goes to liquidator in USD
	pub liquidation_fee_usd: u64,
	/// prevents gaming of oracle with hourly trades
	pub min_profit_time: u64,
	/// cache the total weights of the assets	
	pub total_weights: u64,
	/// account that can make changes to the exchange
	pub admin: Pubkey,
}