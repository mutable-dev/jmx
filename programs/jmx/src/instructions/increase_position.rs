use anchor_spl::token::{Mint, Token};
use anchor_lang::prelude::*;
use crate::constants::*;
use crate::*;

#[derive(Accounts)]
#[instruction(exchange_name: String, asset_name: String)]
pub struct IncreasePosition<'info> {
    // exchange Authority accounts
    #[account(mut)]
    pub user: Signer<'info>,
    // exchange Accounts
    #[account(
        seeds = [exchange_name.as_bytes(), user.key().as_ref(), available_asset.key().as_ref()],
        bump,
    )]
    pub position: Box<Account<'info, Position>>,
		#[account(
			mut,
			seeds = [exchange_name.as_bytes()],
			bump,
		)]
		pub exchange: Box<Account<'info, Exchange>>,
    /// CHECK: this is our authority, no checked account required
    #[account(
        mut,
        seeds = [EXCHANGE_AUTHORITY_SEED.as_bytes(), exchange_name.as_bytes()],
        bump,
    )]
    pub exchange_authority: UncheckedAccount<'info>,
		#[account(
			seeds = [exchange_name.as_bytes(), asset_name.as_bytes()],
			bump
		)]
		pub available_asset: Account<'info, AvailableAsset>,
    #[account()]
    pub collateral_mint: Box<Account<'info, Mint>>,
    // Programs and Sysvars
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<IncreasePosition>, exchange_name: String, asset_name: String) -> ProgramResult {
	Ok(())
}