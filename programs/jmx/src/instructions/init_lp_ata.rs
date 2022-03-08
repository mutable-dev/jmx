use anchor_spl::token::{Mint, Token};
use anchor_lang::prelude::*;
use crate::constants::*;
use crate::*;

#[derive(Accounts)]
#[instruction(exchange_name: String)]
pub struct InitializeLpAta<'info> {
    // exchange Authority accounts
    #[account(
			mut		
		)]
    pub user: Signer<'info>,
    // exchange Accounts
    #[account(
				mut,
        seeds = [exchange_name.as_bytes()],
        bump,
    )]
		pub exchange: Box<Account<'info, Exchange>>,
				#[account(
			mut,
			seeds = [EXCHANGE_AUTHORITY_SEED.as_bytes(), exchange_name.as_bytes()],
			bump,
		)]
		/// CHECK: Authority account, might not need another check
		pub exchange_authority: UncheckedAccount<'info>,
		#[account()]
    pub lp_mint: Box<Account<'info, Mint>>,
		/// CHECK: not sure what type the authority should be, so keeping as unchecked account
    // Programs and Sysvars
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<InitializeLpAta>) -> ProgramResult {
	Ok(())
}