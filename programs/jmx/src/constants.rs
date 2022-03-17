use anchor_lang::constant;

#[constant]
pub const EXCHANGE_INFO_SEED: &str = "exchange-info";
#[constant]
pub const EXCHANGE_AUTHORITY_SEED: &str = "exchange-authority";
#[constant]
pub const LP_MINT_SEED: &str = "lp-mint";
#[constant]
pub const SMALL_UINTS_IN_EXCHANGE: u8 = 8;
#[constant]
pub const AVAILABLE_ASSET_SPACE: u16 = 624;
#[constant]
pub const BASIS_POINTS_PRECISION: u64 = 10000;
#[constant]
pub const FEE_IN_BASIS_POINTS: u64 = 10030;
#[constant]
pub const FEE_RAW: u64 = 30;
#[constant]
pub const MAIN_ASSET_SWAP_FEE_IN_BASIS_POINTS: u16 = 8;
#[constant]
pub const STABLE_ASSET_SWAP_FEE_IN_BASIS_POINTS: u16 = 4;
#[constant]
pub const PENALTY_IN_BASIS_POINTS: u16 = 30;
#[constant]
pub const USDC: &str = "usdc";
