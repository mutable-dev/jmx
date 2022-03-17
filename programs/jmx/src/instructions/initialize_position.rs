use anchor_spl::token::{Mint, Token};
use anchor_lang::prelude::*;
use crate::constants::*;
use crate::*;

#[derive(Accounts)]
#[instruction(exchange_name: String, asset_name: String)]
pub struct InitializePosition<'info> {
    // exchange Authority accounts
    #[account(mut)]
    pub user: Signer<'info>,
    // exchange Accounts
    #[account(
			init,
			seeds = [exchange_name.as_bytes(), user.key().as_ref(), available_asset.key().as_ref()],
			bump,
			payer = user,
			space = Position::LEN,
    )]
    pub position: Box<Account<'info, Position>>,
		#[account(
			mut,
			seeds = [exchange_name.as_bytes(), asset_name.as_bytes()],
			bump,
		)]
		pub available_asset: Box<Account<'info, AvailableAsset>>,
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
		// Other Accounts
		#[account(mut)]
		pub collateral_mint: Box<Account<'info, Mint>>,
    // Programs and Sysvars
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<InitializePosition>, exchange_name: String, asset_name: String) -> ProgramResult {
	let position = &mut ctx.accounts.position;

	position.owner = *ctx.accounts.user.key;
	position.collateral_mint = ctx.accounts.collateral_mint.key();
	position.size = 0;
	position.average_price = 0;
	position.reserve_amount = 0;
	position.entry_funding_rate = 0;
	position.realized_pnl = 0;
	position.in_profit = false;
	position.last_increased_time = 0;
	Ok(())
}

impl Position {
	const LEN: usize = 32 * 3 
	+ (6 * SMALL_UINTS_IN_EXCHANGE as usize)
	+ 4;
}
