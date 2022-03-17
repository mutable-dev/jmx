import * as anchor from '@project-serum/anchor';
import { Program } from '@project-serum/anchor';
import { TOKEN_PROGRAM_ID, createMint, mintToChecked, createAssociatedTokenAccount, getAccount } from "@solana/spl-token";
import BN from 'bn.js';
import { Struct, PublicKey } from '@solana/web3.js';
import { Jmx } from '../target/types/jmx';
import assert from "assert";
import {
  createPriceFeed,
  setFeedPriceInstruction,
  getFeedData,
} from "./pyth/oracleUtils";

const pythProgram = anchor.workspace.Pyth as Program<Pyth>;


class AvailableAsset extends Struct {
  mintAddress: PublicKey;
	/// the decimals for the token
	tokenDecimals: BN;
	/// The weight of this token in the LP 
	tokenWeight: BN;
	/// min about of profit a position needs to be in to take profit before time
	minProfitBasisPoints: BN;
	/// maximum amount of this token that can be in the pool
	maxLptokenAmount: BN;
	/// Flag for whether this is a stable token
	stableToken: boolean;
	/// Flag for whether this asset is shortable
	shortableToken: boolean;
	/// The cumulative funding rate for the asset
	cumulativeFundingRate: BN;
	/// Last time the funding rate was updated
	lastFundingTime: BN;
	/// Account with price oracle data on the asset
	oracleAddress: PublicKey;
	/// Backup account with price oracle data on the asset
	backupOracleAddress: PublicKey;
	/// Global size of shorts denominated in kind
	globalShortSize: BN;
	/// Represents the total outstanding obligations of the protocol (position - size) for the asset
	netProtocolLiabilities: BN
}

const exchangeAuthoritySeed = 'exchange-authority'
const baseUsdcMintLamports = 100000
const baseWSolLamports = 1000

// CHECK: Should query a price oracle instead of being manual
const usdcToSolRate = 82

describe('jmx', () => {

  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.Provider.env());

  const program = anchor.workspace.Jmx as Program<Jmx>;

  let vault: anchor.web3.PublicKey,
  exchangeAuthorityPda,
  exchangeAuthorityBump,
  exchangePda,
  lpMintPda,
  availableAssetPdaUsdc,
  availableAssetPdaWSol,
  exchangeWSolPda,
  exchangeUSDCPda,
  fakeWSolAta,
  fakeUsdcAta,
  usdcPriceFeedAddress,
  wSolpriceFeedAddress,
  usdcOraclePubkey,
  wSolOraclePubkey;

  const fakeUsdcPrice = 1;
  const fakeWSolPrice = 100;
  const exchangeName = 'jmx'
  const usdcSeed = 'usdc'
  const wSolSeed = 'wSol'
  const lpMintSeed = 'lp-mint'
  let fakeUsdcMint;
  let fakeWSolMint;
  let lpTokenAta;
  let remainingAccounts;
  let numOfDeposits = 0
  let fullPenaltyAndFeeMultiplier = .9940
  
  const exchangeAdmin = anchor.web3.Keypair.generate();

  const publicConnection = new anchor.web3.Connection(
    "http://localhost:8899",
    "confirmed"
  );

  it('Is initialized!', async () => {

    usdcOraclePubkey = await createPriceFeed({
      oracleProgram: pythProgram,
      initPrice: fakeUsdcPrice,
      confidence: new BN(20),
      expo: -6,
    });
  
    wSolOraclePubkey = await createPriceFeed({
      oracleProgram: pythProgram,
      initPrice: fakeWSolPrice,
      confidence: new BN(20),
      expo: -4,
    });

    // console.log("usdcOraclePubkey", usdcOraclePubkey.toString())
    // console.log("wSolOraclePubkey", wSolOraclePubkey.toString())

    const provider = anchor.Provider.env()
    anchor.setProvider(provider);

    // Airdrop some SOL to the vault authority
    await publicConnection.confirmTransaction(
      await publicConnection.requestAirdrop(
        exchangeAdmin.publicKey,
        1.0 * anchor.web3.LAMPORTS_PER_SOL // 1 SOL
      ),
      "confirmed"
    );

    [lpMintPda] =
    await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from(lpMintSeed), Buffer.from(exchangeName)],
      program.programId
    );

    [exchangeAuthorityPda] =
    await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from(exchangeAuthoritySeed), Buffer.from(exchangeName)],
      program.programId
    );

    [exchangePda] =
    await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from(exchangeName)],
      program.programId
    );

    fakeUsdcMint = await createMint(
      publicConnection, // connection
      exchangeAdmin, // fee payer
      exchangeAdmin.publicKey, // mint authority
      exchangeAdmin.publicKey, // freeze authority (you can use `null` to disable it. when you disable it, you can't turn it on again)
      8 // decimals
    );

    fakeWSolMint = await createMint(
      publicConnection, // connection
      exchangeAdmin, // fee payer
      exchangeAdmin.publicKey, // mint authority
      exchangeAdmin.publicKey, // freeze authority (you can use `null` to disable it. when you disable it, you can't turn it on again)
      8 // decimals
    );

    const tx = await program.rpc.initializeExchange(
      exchangeName,
      {
        accounts: {
          exchangeAdmin: exchangeAdmin.publicKey,
          exchangeAuthority: exchangeAuthorityPda,
          lpMint: lpMintPda,
          exchange: exchangePda,
          //System stuff
          systemProgram: anchor.web3.SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          tokenProgram: TOKEN_PROGRAM_ID,
        },
        signers: [
          exchangeAdmin
        ]
      });

    let exchangeAccount = await provider.connection.getAccountInfo(
      exchangePda
    );
    const exchangeAccountData = program.coder.accounts.decode('Exchange', exchangeAccount.data)
    assert.equal(exchangeAccountData.taxBasisPoints.toNumber(), 8);
    assert.equal(exchangeAccountData.stableTaxBasisPoints.toNumber(), 4);
    assert.equal(exchangeAccountData.mintBurnBasisPoints.toNumber(), 15);
    assert.equal(exchangeAccountData.swapFeeBasisPoints.toNumber(), 30);
    assert.equal(exchangeAccountData.stableSwapFeeBasisPoints.toNumber(), 8);
    assert.equal(exchangeAccountData.marginFeeBasisPoints.toNumber(), 1);
    assert.equal(exchangeAccountData.liquidationFeeUsd.toNumber(), 40);
    assert.equal(exchangeAccountData.minProfitTime.toNumber(), 15);
    assert.equal(exchangeAccountData.totalWeights.toNumber(), 0);
    assert.equal(exchangeAccountData.admin.toString(), exchangeAdmin.publicKey.toString());
    assert.equal((String.fromCharCode.apply(null, exchangeAccountData.name)) === 'jmx                 ', true);
  });

  // Need to write test for adding multiple assets, 
  // removing some assets while adding some assets
  it('Updates asset whitelist and creates a new available asset for USDC', async () => {
    const provider = anchor.Provider.env()
    anchor.setProvider(provider);

    [availableAssetPdaUsdc] =
    await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from(exchangeName), Buffer.from(usdcSeed)],
      program.programId
    );

    [exchangeUSDCPda] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from(usdcSeed), Buffer.from(exchangeName)],
      program.programId
    );

    const availableAssetInputData = new AvailableAsset({
      mintAddress: fakeUsdcMint,
      tokenDecimals: new BN(1),
      tokenWeight: new BN(10000),
      minProfitBasisPoints: new BN(1),
      maxLptokenAmount: new BN(1),
      stableToken: true,
      shortableToken: true,
      cumulativeFundingRate: new BN(0),
      lastFundingTime: new BN(0),
      oracleAddress: usdcOraclePubkey,
      backupOracleAddress: usdcOraclePubkey,
      globalShortSize: new BN(0),
      netProtocolLiabilities: new BN(0),
    })

    let tx = await program.rpc.initializeAvailableAsset(
      exchangeName,
      usdcSeed,
      availableAssetInputData,
      {
        accounts: {
          exchangeAdmin: exchangeAdmin.publicKey,
          exchangeAuthority: exchangeAuthorityPda,
          exchange: exchangePda,
          mint: fakeUsdcMint,
          availableAsset: availableAssetPdaUsdc,
          exchangeReserveToken: exchangeUSDCPda,
          //System stuff
          systemProgram: anchor.web3.SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          tokenProgram: TOKEN_PROGRAM_ID,
        },
        signers: [
          exchangeAdmin
        ]
      }
    );

   tx = await program.rpc.updateAssetWhitelist(
      exchangeName,
      [fakeUsdcMint, fakeWSolMint],
      [usdcOraclePubkey, wSolOraclePubkey],
      {
        accounts: {
          exchangeAdmin: exchangeAdmin.publicKey,
          exchange: exchangePda,
          //System stuff
          systemProgram: anchor.web3.SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          tokenProgram: TOKEN_PROGRAM_ID,
        },
        signers: [
          exchangeAdmin
        ]
      }
    );

    let exchangeAccount = await provider.connection.getAccountInfo(
      exchangePda
    );
    const exchangeAccountData = program.coder.accounts.decode('Exchange', exchangeAccount.data)
    assert.equal(exchangeAccountData.assets[0].toString(), fakeUsdcMint.toString());
    assert.equal(exchangeAccountData.assets[1].toString(), fakeWSolMint.toString())

    assert.equal(exchangeAccountData.priceOracles[0].toString(), usdcOraclePubkey.toString());
    assert.equal(exchangeAccountData.priceOracles[1].toString(), wSolOraclePubkey.toString())
    let availableAssetAccount = await provider.connection.getAccountInfo(
      availableAssetPdaUsdc
    );
    const availableAssetAccountData = program.coder.accounts.decode('AvailableAsset', availableAssetAccount.data)
    assert.equal(availableAssetAccountData.tokenDecimals.toNumber(), 1);
    assert.equal(availableAssetAccountData.tokenWeight.toNumber(), 10000);
    assert.equal(availableAssetAccountData.minProfitBasisPoints.toNumber(), 1);
    assert.equal(availableAssetAccountData.maxLptokenAmount.toNumber(), 1);
    assert.equal(availableAssetAccountData.cumulativeFundingRate.toNumber(), 0);
    assert.equal(availableAssetAccountData.lastFundingTime.toNumber(), 0);
    assert.equal(availableAssetAccountData.stableToken, true);
    assert.equal(availableAssetAccountData.shortableToken, true);
    assert.equal(availableAssetAccountData.oracleAddress.toString(), usdcOraclePubkey.toString());
    assert.equal(availableAssetAccountData.backupOracleAddress.toString(), usdcOraclePubkey.toString());
    assert.equal(availableAssetAccountData.globalShortSize.toNumber(), 0);
    assert.equal(availableAssetAccountData.netProtocolLiabilities.toNumber(), 0);
    assert.equal(availableAssetAccountData.mintAddress.toString(), fakeUsdcMint.toString());
    assert.equal(availableAssetAccountData.poolReserves.toNumber(), 0);

    let exchangeAccountInfo = await provider.connection.getAccountInfo(
      exchangePda
    );
    const exchangeAccountInfoData = program.coder.accounts.decode('Exchange', exchangeAccountInfo.data)
    assert.equal(exchangeAccountInfoData.totalWeights, 10000)
  });

  it('Creates a new available asset for wSol', async () => {
    const provider = anchor.Provider.env()
    anchor.setProvider(provider);

    [availableAssetPdaWSol] =
    await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from(exchangeName), Buffer.from(wSolSeed)],
      program.programId
    );

    [exchangeWSolPda] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from(wSolSeed), Buffer.from(exchangeName)],
      program.programId
    );

    const availableAssetInputData = new AvailableAsset({
      mintAddress: fakeWSolMint,
      tokenDecimals: new BN(1),
      tokenWeight: new BN(10000),
      minProfitBasisPoints: new BN(1),
      maxLptokenAmount: new BN(1),
      stableToken: true,
      shortableToken: true,
      cumulativeFundingRate: new BN(0),
      lastFundingTime: new BN(0),
      oracleAddress: wSolOraclePubkey,
      backupOracleAddress: wSolOraclePubkey,
      globalShortSize: new BN(0),
      netProtocolLiabilities: new BN(0),
    })

    let tx = await program.rpc.initializeAvailableAsset(
      exchangeName,
      wSolSeed,
      availableAssetInputData,
      {
        accounts: {
          exchangeAdmin: exchangeAdmin.publicKey,
          exchangeAuthority: exchangeAuthorityPda, 
          exchange: exchangePda,
          mint: fakeWSolMint,
          availableAsset: availableAssetPdaWSol,
          exchangeReserveToken: exchangeWSolPda,
          //System stuff
          systemProgram: anchor.web3.SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          tokenProgram: TOKEN_PROGRAM_ID,
        },
        signers: [
          exchangeAdmin
        ]
      }
    );

   tx = await program.rpc.updateAssetWhitelist(
      exchangeName,
      [fakeUsdcMint, fakeWSolMint],
      [usdcOraclePubkey, wSolOraclePubkey],
      {
        accounts: {
          exchangeAdmin: exchangeAdmin.publicKey,
          exchange: exchangePda,
          //System stuff
          systemProgram: anchor.web3.SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          tokenProgram: TOKEN_PROGRAM_ID,
        },
        signers: [
          exchangeAdmin
        ]
      }
    );

    let exchangeAccount = await provider.connection.getAccountInfo(
      exchangePda
    );
    const exchangeAccountData = program.coder.accounts.decode('Exchange', exchangeAccount.data)
    assert.equal(exchangeAccountData.assets[0].toString(), fakeUsdcMint.toString());
    assert.equal(exchangeAccountData.assets[1].toString(), fakeWSolMint.toString())

    let availableAssetAccount = await provider.connection.getAccountInfo(
      availableAssetPdaWSol
    );
    const availableAssetAccountData = program.coder.accounts.decode('AvailableAsset', availableAssetAccount.data)
    assert.equal(availableAssetAccountData.tokenDecimals.toNumber(), 1);
    assert.equal(availableAssetAccountData.tokenWeight.toNumber(), 10000);
    assert.equal(availableAssetAccountData.minProfitBasisPoints.toNumber(), 1);
    assert.equal(availableAssetAccountData.maxLptokenAmount.toNumber(), 1);
    assert.equal(availableAssetAccountData.cumulativeFundingRate.toNumber(), 0);
    assert.equal(availableAssetAccountData.lastFundingTime.toNumber(), 0);
    assert.equal(availableAssetAccountData.stableToken, true);
    assert.equal(availableAssetAccountData.shortableToken, true);
    assert.equal(availableAssetAccountData.oracleAddress.toString(), wSolOraclePubkey.toString());
    assert.equal(availableAssetAccountData.backupOracleAddress.toString(), wSolOraclePubkey.toString());
    assert.equal(availableAssetAccountData.globalShortSize.toNumber(), 0);
    assert.equal(availableAssetAccountData.netProtocolLiabilities.toNumber(), 0);
    assert.equal(availableAssetAccountData.mintAddress.toString(), fakeWSolMint.toString());
    assert.equal(availableAssetAccountData.poolReserves.toNumber(), 0);
  });

  it('mints LP with USDC for the first and second time', async () => {
    const provider = anchor.Provider.env()
    anchor.setProvider(provider);

    [availableAssetPdaUsdc] =
    await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from(exchangeName), Buffer.from(usdcSeed)],
      program.programId
    );

    [exchangeUSDCPda] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from(usdcSeed), Buffer.from(exchangeName)],
      program.programId
    );

    fakeUsdcAta = await createAssociatedTokenAccount(
      publicConnection, // connection
      exchangeAdmin, // fee payer
      fakeUsdcMint, // mint
      exchangeAdmin.publicKey // owner,
    );

    let fakeUsdcMintTx = await mintToChecked(
      publicConnection, // connection
      exchangeAdmin, // fee payer
      fakeUsdcMint, // mint
      fakeUsdcAta, // receiver (sholud be a token account)
      exchangeAdmin, // mint authority
      1e8, // amount. if your decimals is 8, you mint 10^8 for 1 token.
      8 // decimals
    );

    lpTokenAta = await createAssociatedTokenAccount(
      publicConnection, // connection
      exchangeAdmin, // fee payer
      lpMintPda, // mint
      exchangeAdmin.publicKey // owner,
    );

    remainingAccounts = [
      {
        pubkey: exchangeUSDCPda,
        isWritable: false,
        isSigner: false
      },
      {
        pubkey: usdcOraclePubkey,
        isWritable: false,
        isSigner: false
      },
      {
        pubkey: exchangeWSolPda,
        isWritable: false,
        isSigner: false
      },
      {
        pubkey: wSolOraclePubkey,
        isWritable: false,
        isSigner: false
      },
    ]

    let tx = await program.rpc.mintLpToken(
      exchangeName,
      usdcSeed,
      new BN(baseUsdcMintLamports),
      {
        accounts: {
          userAuthority: exchangeAdmin.publicKey,
          exchangeAuthority: exchangeAuthorityPda,
          userReserveToken: fakeUsdcAta,
          userLpToken: lpTokenAta,
          exchange: exchangePda,
          exchangeReserveToken: exchangeUSDCPda,
          lpMint: lpMintPda,
          availableAsset: availableAssetPdaUsdc,
          //System stuff
          systemProgram: anchor.web3.SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          tokenProgram: TOKEN_PROGRAM_ID,
        },
        signers: [
          exchangeAdmin
        ],
        remainingAccounts: remainingAccounts
      }
    );
    numOfDeposits += 1

    await sleep(400)

    let user_lp_token_account = await getAccount(
      publicConnection,
      lpTokenAta,
      'confirmed'
    )

    let availableAssetAccount = await provider.connection.getAccountInfo(
      availableAssetPdaUsdc
    );
    let availableAssetAccountData = program.coder.accounts.decode('AvailableAsset', availableAssetAccount.data)

    assert.equal(Number(availableAssetAccountData.poolReserves), baseUsdcMintLamports * numOfDeposits);
    assert.equal(Number(availableAssetAccountData.feeReserves) === 0, true);
    // console.log("availableAssetAccountData.feeReserves", Number(availableAssetAccountData.feeReserves))
    // console.log("Number(availableAssetAccountData.poolReserves)", Number(availableAssetAccountData.poolReserves))
    // console.log("baseUsdcMintLamports * numOfDeposits", baseUsdcMintLamports * numOfDeposits)
    assert.equal(Number(user_lp_token_account.amount), baseUsdcMintLamports * numOfDeposits);

    let tx2 = await program.rpc.mintLpToken(
      exchangeName,
      usdcSeed,
      new BN(baseUsdcMintLamports),
      {
        accounts: {
          userAuthority: exchangeAdmin.publicKey,
          exchangeAuthority: exchangeAuthorityPda,
          userReserveToken: fakeUsdcAta,
          userLpToken: lpTokenAta,
          exchange: exchangePda,
          exchangeReserveToken: exchangeUSDCPda,
          lpMint: lpMintPda,
          availableAsset: availableAssetPdaUsdc,
          //System stuff
          systemProgram: anchor.web3.SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          tokenProgram: TOKEN_PROGRAM_ID,
        },
        signers: [
          exchangeAdmin
        ],
        remainingAccounts: remainingAccounts
      }
    );
    numOfDeposits += 1

    await sleep(400)

    user_lp_token_account = await getAccount(
      publicConnection,
      lpTokenAta,
      'confirmed'
    )
    availableAssetAccount = await provider.connection.getAccountInfo(
      availableAssetPdaUsdc
    );
    availableAssetAccountData = program.coder.accounts.decode('AvailableAsset', availableAssetAccount.data)

    // console.log("availableAssetAccountData.poolReserves.toNumber()", availableAssetAccountData.poolReserves.toNumber())
    // console.log("availableAssetAccountData.feeReserves.toNumber()", availableAssetAccountData.feeReserves.toNumber())
    // assert.equal(availableAssetAccountData.poolReserves.toNumber() >= estimatedPoolReserves, true);
    // assert.equal(availableAssetAccountData.feeReserves.toNumber() >= estimatedFeeReserves, true);
    // assert.equal(estimatedFeeReserves + estimatedPoolReserves, baseUsdcLamports * numOfDeposits)
    assert.equal(Number(user_lp_token_account.amount), baseUsdcMintLamports * numOfDeposits - (baseUsdcMintLamports * (1 - fullPenaltyAndFeeMultiplier)));
    assert.equal(Number(user_lp_token_account.amount), 199400);
  });

  it('mints LP with wSOL for the first and second time and then burns', async () => {
    const provider = anchor.Provider.env()
    anchor.setProvider(provider);

    [availableAssetPdaWSol] =
    await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from(exchangeName), Buffer.from(wSolSeed)],
      program.programId
    );

    [exchangeWSolPda] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from(wSolSeed), Buffer.from(exchangeName)],
      program.programId
    );

    fakeWSolAta = await createAssociatedTokenAccount(
      publicConnection, // connection
      exchangeAdmin, // fee payer
      fakeWSolMint, // mint
      exchangeAdmin.publicKey // owner,
    );

    let fakeWSolMintTx = await mintToChecked(
      publicConnection, // connection
      exchangeAdmin, // fee payer
      fakeWSolMint, // mint
      fakeWSolAta, // receiver (sholud be a token account)
      exchangeAdmin, // mint authority
      1e8, // amount. if your decimals is 8, you mint 10^8 for 1 token.
      8 // decimals
    );

    let tx = await program.rpc.mintLpToken(
      exchangeName,
      wSolSeed,
      new BN(baseWSolLamports),
      {
        accounts: {
          userAuthority: exchangeAdmin.publicKey,
          exchangeAuthority: exchangeAuthorityPda,
          userReserveToken: fakeWSolAta,
          userLpToken: lpTokenAta,
          exchange: exchangePda,
          exchangeReserveToken: exchangeWSolPda,
          lpMint: lpMintPda,
          availableAsset: availableAssetPdaWSol,
          //System stuff
          systemProgram: anchor.web3.SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          tokenProgram: TOKEN_PROGRAM_ID,
        },
        signers: [
          exchangeAdmin
        ],
        remainingAccounts: remainingAccounts
      }
    );
    numOfDeposits += 1;

    await sleep(400)

    let user_lp_token_account = await getAccount(
      publicConnection,
      lpTokenAta,
      'confirmed'
    )

    let availableAssetAccount = await provider.connection.getAccountInfo(
      availableAssetPdaWSol
    );
    let availableAssetAccountData = program.coder.accounts.decode('AvailableAsset', availableAssetAccount.data)

    let exchange_wsol_token_account = await getAccount(
      publicConnection,
      exchangeWSolPda,
      'confirmed'
    )
    // console.log("first user_lp_token_account", Number(user_lp_token_account.amount))
    
    // console.log("availableAssetAccountData.fee, availableAssetAccountData.pool", Number(availableAssetAccountData.fee), Number(availableAssetAccountData.poolReserves))
    // console.log("exchange_wsol_token_account", Number(exchange_wsol_token_account.amount))
    assert.equal(Number(availableAssetAccountData.poolReserves) + Number(availableAssetAccountData.feeReserves), Number(exchange_wsol_token_account.amount))
    assert.equal(Number(exchange_wsol_token_account.amount), baseWSolLamports)
    const fxRateDiff = .0030
    assert.equal(Number(user_lp_token_account.amount), numOfDeposits * baseUsdcMintLamports - (baseUsdcMintLamports * (1 - fullPenaltyAndFeeMultiplier + fxRateDiff)));

    let tx2 = await program.rpc.mintLpToken(
      exchangeName,
      wSolSeed,
      new BN(baseWSolLamports),
      {
        accounts: {
          userAuthority: exchangeAdmin.publicKey,
          exchangeAuthority: exchangeAuthorityPda,
          userReserveToken: fakeWSolAta,
          userLpToken: lpTokenAta,
          exchange: exchangePda,
          exchangeReserveToken: exchangeWSolPda,
          lpMint: lpMintPda,
          availableAsset: availableAssetPdaWSol,
          //System stuff
          systemProgram: anchor.web3.SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          tokenProgram: TOKEN_PROGRAM_ID,
        },
        signers: [
          exchangeAdmin
        ],
        remainingAccounts: remainingAccounts
      }
    );

    await sleep(400)

    user_lp_token_account = await getAccount(
      publicConnection,
      lpTokenAta,
      'confirmed'
    )
    availableAssetAccount = await provider.connection.getAccountInfo(
      availableAssetPdaWSol
    );
    availableAssetAccountData = program.coder.accounts.decode('AvailableAsset', availableAssetAccount.data)
    // console.log("second availableAssetAccountData", Number(availableAssetAccountData.poolReserves))
    // console.log("second availableAssetAccountData", Number(availableAssetAccountData.feeReserves))
    // console.log("second user_lp_token_account", Number(user_lp_token_account.amount))
    assert.equal(availableAssetAccountData.poolReserves.toNumber(), 1996);
    assert.equal(availableAssetAccountData.feeReserves.toNumber(), 4);
    assert.equal(Number(user_lp_token_account.amount), 398401);

    let tx3 = await program.rpc.burnLpToken(
      exchangeName,
      wSolSeed,
      new BN(70000),
      {
        accounts: {
          userAuthority: exchangeAdmin.publicKey,
          exchangeAuthority: exchangeAuthorityPda,
          userReserveToken: fakeWSolAta,
          userLpToken: lpTokenAta,
          exchange: exchangePda,
          exchangeReserveToken: exchangeWSolPda,
          lpMint: lpMintPda,
          availableAsset: availableAssetPdaWSol,
          //System stuff
          systemProgram: anchor.web3.SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          tokenProgram: TOKEN_PROGRAM_ID,
        },
        signers: [
          exchangeAdmin
        ],
        remainingAccounts: remainingAccounts
      }
    );

    await sleep(400)

    user_lp_token_account = await getAccount(
      publicConnection,
      lpTokenAta,
      'confirmed'
    )

    let wSolExchangeTokenAccount = await getAccount(
      publicConnection,
      exchangeWSolPda,
      'confirmed'
    )

    availableAssetAccount = await provider.connection.getAccountInfo(
      availableAssetPdaWSol
    );
    availableAssetAccountData = program.coder.accounts.decode('AvailableAsset', availableAssetAccount.data)


    let wSolPoolReserves = availableAssetAccountData.poolReserves.toNumber()
    let wSolPoolFees = availableAssetAccountData.feeReserves.toNumber()

    // console.log("wSolPoolReserves", wSolPoolReserves)
    // console.log("wSolPoolFees", wSolPoolFees)
    // console.log("wSolExchangeTokenAccount", Number(wSolExchangeTokenAccount.amount))
    // console.log("user_lp_token_account.amount", user_lp_token_account.amount)
    assert.equal(wSolPoolReserves, 1291);
    assert.equal(wSolPoolFees, 8);
    assert.equal(Number(wSolExchangeTokenAccount.amount), 1299);
    assert.equal(Number(user_lp_token_account.amount) >= 270000, true);
    assert.equal(Number(user_lp_token_account.amount) <= 330000, true);
  });

  it('trades wSol for USDC and charges the user bps for doing so', async () => {
    const provider = anchor.Provider.env()
    anchor.setProvider(provider);

    let beforeWSolUserTokenAccount = await getAccount(
      publicConnection,
      fakeWSolAta,
      'confirmed'
    )

    let beforeUsdcUserTokenAccount = await getAccount(
      publicConnection,
      fakeUsdcAta,
      'confirmed'
    )

    let tx2 = await program.rpc.swap(
      exchangeName,
      usdcSeed,
      wSolSeed,
      new BN(baseUsdcMintLamports),
      {
        accounts: {
          userAuthority: exchangeAdmin.publicKey,
          exchangeAuthority: exchangeAuthorityPda,
          userInputToken: fakeUsdcAta,
          userOutputToken: fakeWSolAta,
          exchange: exchangePda,
          inputExchangeReserveToken: exchangeUSDCPda,
          outputExchangeReserveToken: exchangeWSolPda,
          inputAvailableAsset: availableAssetPdaUsdc,
          outputAvailableAsset: availableAssetPdaWSol,
          //System stuff
          systemProgram: anchor.web3.SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          tokenProgram: TOKEN_PROGRAM_ID,
        },
        signers: [
          exchangeAdmin
        ],
        remainingAccounts: remainingAccounts
      }
    );

    await sleep(400)

    let wSolUserTokenAccount = await getAccount(
      publicConnection,
      fakeWSolAta,
      'confirmed'
    )

    let usdcUserTokenAccount = await getAccount(
      publicConnection,
      fakeUsdcAta,
      'confirmed'
    )

    let wSolExchangeTokenAccount = await getAccount(
      publicConnection,
      exchangeWSolPda,
      'confirmed'
    )

    let availableAssetAccount = await provider.connection.getAccountInfo(
      availableAssetPdaWSol
    );
    let availableAssetAccountData = program.coder.accounts.decode('AvailableAsset', availableAssetAccount.data)


    let wSolPoolReserves = availableAssetAccountData.poolReserves.toNumber()
    let wSolPoolFees = availableAssetAccountData.feeReserves.toNumber()

    console.log("wSolPoolReserves", wSolPoolReserves)
    console.log("wSolPoolFees", wSolPoolFees)
    console.log("wSolExchangeTokenAccount", Number(wSolExchangeTokenAccount.amount))
    console.log("beforeUsdcUserTokenAccount.amount", Number(beforeUsdcUserTokenAccount.amount))

    assert.equal(Number(beforeUsdcUserTokenAccount.amount), Number(usdcUserTokenAccount.amount) + baseUsdcMintLamports)
    assert.equal(Number(wSolExchangeTokenAccount.amount), 304)
    assert.equal(wSolPoolReserves, 291);
    assert.equal(wSolPoolFees, 13);
    assert.equal(Number(wSolExchangeTokenAccount.amount), wSolPoolReserves + wSolPoolFees);
  })
});

export function sleep(ms) {
  console.log("Sleeping for", ms / 1000, "seconds");
  return new Promise((resolve) => setTimeout(resolve, ms));
}