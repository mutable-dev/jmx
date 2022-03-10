import * as anchor from "@project-serum/anchor";
import { BN, Program, web3 } from "@project-serum/anchor";
import assert from "assert";
import { Pyth } from "../../target/types/pyth";
import {
  createPriceFeed,
  setFeedPriceInstruction,
  getFeedData,
} from "./oracleUtils";

describe("pyth-oracle", () => {
  anchor.setProvider(anchor.Provider.env());
  const program = anchor.workspace.Pyth as Program<Pyth>;

  it("initialize", async () => {
    const price = 50000;
    const priceFeedAddress = await createPriceFeed({
      oracleProgram: program,
      initPrice: price,
      expo: -6,
    });
    const feedData = await getFeedData(program, priceFeedAddress);
    if (!feedData) return;
    assert.ok(feedData.price === price);
  });

  it("change feed price", async () => {
    const price = 50000;
    const expo = -7;
    const priceFeedAddress = await createPriceFeed({
      oracleProgram: program,
      initPrice: price,
      expo: expo,
    });
    const feedDataBefore = await getFeedData(program, priceFeedAddress);
    if (!feedDataBefore) throw new Error("feedDataBefore is empty");
    assert.ok(feedDataBefore.price === price);
    assert.ok(feedDataBefore.exponent === expo);

    const newPrice = 55000;
    const instruction = await setFeedPriceInstruction(
      program,
      newPrice,
      priceFeedAddress
    );
    const transaction = new anchor.web3.Transaction().add(instruction);
    await program.provider.send(transaction);
    const feedDataAfter = await getFeedData(program, priceFeedAddress);
    if (!feedDataAfter) throw new Error("feedDataAfter is empty");
    assert.ok(feedDataAfter.price === newPrice);
    assert.ok(feedDataAfter.exponent === expo);
  });
});
