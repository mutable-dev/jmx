use anchor_lang::prelude::*;
use anchor_spl::token::{self, Burn, CloseAccount, Mint, MintTo, Token, TokenAccount, Transfer};
declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

pub mod constants;
pub mod types;
pub mod instructions;
pub mod state;

use types::ProgramResult;
use instructions::*;
use state::*;
use std::ops::Deref;


#[program]
pub mod jmx {
    use super::*;
    pub fn initialize_exchange(ctx: Context<InitializeExchange>, exchange_name: String) -> ProgramResult {
        instructions::initialize_exchange::handler(ctx, exchange_name)
    }

    pub fn update_asset_whitelist(ctx: Context<UpdateAssetWhitelist>, en: String, assets: Vec<Pubkey>, price_oracles: Vec<Pubkey>) -> ProgramResult {
        instructions::update_asset_whitelist::handler(ctx, en, assets, price_oracles)
    }
    
    // Should throw an error if someone tries to init an already initialized available asset account or an already init-ed token account for that asset
    pub fn initialize_available_asset(ctx: Context<InitializeAvailableAsset>, exchange_name: String, asset_name: String, asset_data: AvailableAsset) -> ProgramResult {
        instructions::initialize_available_asset::handler(ctx, exchange_name, asset_name, asset_data)
    }

    pub fn init_lp_ata(ctx: Context<InitializeLpAta>) -> ProgramResult {
        instructions::init_lp_ata::handler(ctx)
    }

    pub fn mint_lp_token(ctx: Context<MintLpToken>, exchange_name: String, asset_name: String, lamports: u64) -> ProgramResult {
        instructions::mint_lp_token::handler(ctx, exchange_name, asset_name, lamports)
    }

    pub fn burn_lp_token(ctx: Context<BurnLpToken>, exchange_name: String, asset_name: String, lamports: u64) -> ProgramResult {
        instructions::burn_lp_token::handler(ctx, exchange_name, asset_name, lamports)
    }
}

#[macro_export]
macro_rules! exchange_authority_seeds {
    (
        exchange_name = $exchange_name:expr,
        bump = $bump:expr
    ) => {
        &[
            EXCHANGE_AUTHORITY_SEED.as_bytes(),
            $exchange_name.strip(),
            &[$bump],
        ]
    };
}

/// Trait to allow trimming ascii whitespace from a &[u8].
pub trait StripAsciiWhitespace {
    /// Trim ascii whitespace (based on `is_ascii_whitespace()`) from the
    /// start and end of a slice.
    fn strip(&self) -> &[u8];
}

impl<T: Deref<Target = [u8]>> StripAsciiWhitespace for T {
    fn strip(&self) -> &[u8] {
        let from = match self.iter().position(|x| !x.is_ascii_whitespace()) {
            Some(i) => i,
            None => return &self[0..0],
        };
        let to = self.iter().rposition(|x| !x.is_ascii_whitespace()).unwrap();
        &self[from..=to]
    }
}