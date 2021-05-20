import { Contract } from "@herajs/client";
import { utils } from "eth-merkle-bridge-js";
import { BigNumber } from "bignumber.js";
import { aergoBridgeAbi } from "../abi/AergoBridge";

export async function buildFreezeToAergoTx(
    txSender,
    amount,
    bridgeAergoAddr, 
    bridgeAergoAbi,
    receiverAergoAddr, 
    gasLimit=300000,
) {
    utils.checkAergoAddress(txSender);
    utils.checkAergoAddress(bridgeAergoAddr);
    utils.checkAergoAddress(receiverAergoAddr);
    const args = [receiverAergoAddr, {_bignum: amount}];
    const contract = Contract.atAddress(bridgeAergoAddr);
    contract.loadAbi(bridgeAergoAbi);
    const builtTx = await contract.freeze(...args).asTransaction({
        from: txSender,
        amount: amount.concat(' aer'),
        limit: gasLimit,
    });
    return builtTx;
}

export async function buildUnfreezeToAergoTx(
    txSender,
    fromHerajs,
    toHerajs,
    fromBridgeAergoAddr,
    toBridgeAergoAddr, 
    toBridgeAergoAbi,
    receiverAergoAddr, 
    gasLimit=300000,
) {
    utils.checkAergoAddress(txSender);
    utils.checkAergoAddress(fromBridgeAergoAddr);
    utils.checkAergoAddress(toBridgeAergoAddr);
    utils.checkAergoAddress(receiverAergoAddr);
    // build lock proof
    const proof = await buildFreezeProof(fromHerajs, toHerajs, fromBridgeAergoAddr, toBridgeAergoAddr, receiverAergoAddr);
    const ap = [];
    proof.varProofs[0].auditPath.map(function(proofNode){
      ap.push(Buffer.from(proofNode).toString('hex'));
    });
    
    const totalDepositBalance = proof.varProofs[0].value
    const args = [receiverAergoAddr, {_bignum: totalDepositBalance}, ap];
    /* eslint-disable */
    console.log('proof', proof);
    console.log('contract args', args);
    const contract = Contract.fromAbi(aergoBridgeAbi).setAddress(toBridgeAergoAddr);
    const builtTx = await contract.unfreeze(...args).asTransaction({
        from: txSender,
        limit: gasLimit,
        amount: 0,
    });
    return builtTx;
    
}

async function buildFreezeProof(
  fromHerajs,
  toHerajs,
  fromBridgeAergoAddr,
  toBridgeAergoAddr,
  receiverAergoAddr
) {
  
  const contract = Contract.fromAbi(aergoBridgeAbi).setAddress(toBridgeAergoAddr);
  // check last merged height
  let query = contract.queryState("_sv__anchorHeight");
  const lastMergedHeight = await toHerajs.queryContractState(query);
  const mergeBlockHeader = await fromHerajs.getBlockHeaders(
        lastMergedHeight, 1)
  const rootFrom = Buffer.from(
      mergeBlockHeader[0].header.blocksroothash, 'base64')
  //FIXME mint chainge!~~@@
  const accountRef = receiverAergoAddr;
  const freezesKey = Buffer.from('_sv__freezes-'.concat(accountRef), 'utf-8');
  //FIXME
  /*
  const accountRef = receiverAergoAddr + 'AmgnNKadR4gv2ELgqgtyGM9ec5EnpHj5ai14z3juNmo6m6LsdtEU';
  const freezesKey = Buffer.from('_sv__locks-'.concat(accountRef), 'utf-8');
  */
  const fromAergoBridge = Contract.fromAbi(aergoBridgeAbi).setAddress(fromBridgeAergoAddr);
  query = fromAergoBridge.queryState(freezesKey, false, rootFrom); //
  //query = fromAergoBridge.queryState(freezesKey);
  const proof = await fromHerajs.queryContractStateProof(query);
  /* eslint-disable */
  console.log('height', lastMergedHeight);
  console.log('rootFrom', rootFrom);
  console.log('account_ref', accountRef);
  console.log('proof', proof);
  
  //FIXME until here
  
  // TODO proof verification
  return proof;
}

export async function unfreezable(
    fromHerajs,
    toHerajs,
    fromBridgeAergoAddr,
    toBridgeAergoAddr,
    receiverAergoAddr
) {
  const accountRef = receiverAergoAddr;
  const freezesKey = Buffer.from('_sv__freezes-'.concat(accountRef), 'utf-8');
  //const fromAergoBridge = Contract.atAddress(fromBridgeAergoAddr);
  //fromAergoBridge.loadAbi(aergoBridgeAbi);
  const fromAergoBridge = Contract.fromAbi(aergoBridgeAbi).setAddress(fromBridgeAergoAddr);
  
  // totalDeposit : total latest deposit including pending
  let query = fromAergoBridge.queryState(freezesKey);
  let storageValue;
  try {
      storageValue = await fromHerajs.queryContractState(query);
  } catch (Error) {
      storageValue = 0;
      // eslint-disable-next-line
      console.error(Error);
  }
  const totalDeposit = new BigNumber(storageValue);
  // get total withdrawn and last anchor height
  const unfreezesKey = Buffer.from('_sv__unfreezes-'.concat(accountRef), 'utf-8');
  const toAergoBridge = Contract.atAddress(toBridgeAergoAddr);
  toAergoBridge.loadAbi(aergoBridgeAbi);
  query = toAergoBridge.queryState(
      ["_sv__anchorHeight", unfreezesKey]);
  let [lastAnchorHeight, totalWithdrawn] = await toHerajs.queryContractState(query);
  if (totalWithdrawn === undefined) {
      totalWithdrawn = 0;
  }
  totalWithdrawn = new BigNumber(totalWithdrawn);
  // get last anchor
  const mergeBlockHeader = await fromHerajs.getBlockHeaders(
      lastAnchorHeight, 1);
  const root = Buffer.from(
      mergeBlockHeader[0].header.blocksroothash, 'base64');
  // get anchored deposit : total deposit before the last anchor
  // eslint-disable-next-line
  // console.log(mergeBlockHeader)
  
  //query = Contract.atAddress(fromBridgeAergoAddr).queryState(freezesKey);
  try {
      storageValue = await fromHerajs.queryContractState(fromAergoBridge.queryState(freezesKey, false, root));
  } catch (Error) {
      storageValue = 0;
      // eslint-disable-next-line
      console.error(Error);
  }
  const anchoredDeposit = new BigNumber(storageValue);
  // calculate withdrawable and pending
  const withdrawableBalance = anchoredDeposit.minus(totalWithdrawn).toString(10);
  const pending = totalDeposit.minus(anchoredDeposit).toString(10);
  return [withdrawableBalance, pending];
}

/**
 * Get the anchoring statue of Aergo to Aergo
 */
export async function getAnchorState(toHerajs, fromHerajs, toBridgeAergoAddr) {
  utils.checkAergoAddress(toBridgeAergoAddr);
  // get a anchoring status of to chain
  const aergoBridge = Contract.atAddress(toBridgeAergoAddr).loadAbi(aergoBridgeAbi);
  const query = aergoBridge.queryState(
      ["_sv__anchorHeight", "_sv__tAnchor", "_sv__tFinal"]);
  const [lastAnchorHeight, tAnchor, tFinal] = await toHerajs.queryContractState(query);
  
  // get a height of from chain
  const head = await fromHerajs.blockchain()
  const bestHeight = head.bestHeight
  return {
      lastAnchorHeight: lastAnchorHeight,
      tAnchor: tAnchor,
      tFinal: tFinal,
      bestHeight: bestHeight
  }
}