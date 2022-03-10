use anchor_lang::prelude::*;
pub mod pc;
pub use pc::Price;

#[cfg(not(feature = "devnet"))]
declare_id!("FsJ3A3u2vn5cTVofAjvy6y5kwABJAqYWpe4975bi2epH");
#[cfg(feature = "devnet")]
declare_id!("gSbePebfvPy7tRqimPoVecS2UsBvYv46ynrzWocc92s");

#[program]
pub mod pyth {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, price: i64, expo: i32, conf: u64) -> ProgramResult {
        let oracle = &ctx.accounts.price;

        let mut price_oracle = Price::load(&oracle).unwrap();

        price_oracle.agg.price = price;
        price_oracle.agg.conf = conf;
        price_oracle.expo = expo;
        price_oracle.ptype = pc::PriceType::Price;
        Ok(())
    }

    pub fn set_price(ctx: Context<SetPrice>, price: i64) -> ProgramResult {
        let oracle = &ctx.accounts.price;
        let mut price_oracle = Price::load(&oracle).unwrap();
        price_oracle.agg.price = price as i64;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct SetPrice<'info> {
    #[account(mut)]
    /// CHECK: Unsafe price field (https://book.anchor-lang.com/chapter_3/the_accounts_struct.html#safety-checks)
    pub price: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    /// CHECK: Unsafe price field (https://book.anchor-lang.com/chapter_3/the_accounts_struct.html#safety-checks)
    pub price: AccountInfo<'info>,
}
