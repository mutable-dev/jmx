import { Struct, PublicKey } from '@solana/web3.js';
import BN from 'bn.js';

export class AvailableAsset extends Struct {
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

export class Position extends Struct {
  owner: PublicKey;
	/// the decimals for the token
	collateralMint: PublicKey;
	/// The weight of this token in the LP 
	size: BN;
	/// min about of profit a position needs to be in to take profit before time
	reeserveAmount: BN;
	/// maximum amount of this token that can be in the pool
	entryFundingRate: BN;
	/// Flag for whether this is a stable token
	realizedPnl: BN;
	/// Flag for whether this asset is shortable
	shortableToken: boolean;
	/// The cumulative funding rate for the asset
	inProfit: BN;
	/// Last time the funding rate was updated
	lastIncreasedTime: BN;
}