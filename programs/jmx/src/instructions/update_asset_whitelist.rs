use anchor_spl::token::{Token};
use anchor_lang::prelude::*;
use crate::*;

#[derive(Accounts)]
#[instruction(exchange_name: String)]
pub struct UpdateAssetWhitelist<'info> {
    // exchange Authority accounts
    #[account(
			mut,
			constraint = exchange_admin.key() == exchange.admin
		)]
    pub exchange_admin: Signer<'info>,
    // exchange Accounts
    #[account(
				mut,
        seeds = [exchange_name.as_bytes()],
        bump,
    )]
    pub exchange: Box<Account<'info, Exchange>>,
    // Programs and Sysvars
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<UpdateAssetWhitelist>, en: String, assets: Vec<Pubkey>) -> ProgramResult {
	let exchange = &mut ctx.accounts.exchange;
	exchange.assets = assets;
	Ok(())
}