import { useState } from "react";
import { Card, Button, Input, Badge, shortAddr } from "./ui";
import { getWriteContract, getReadContract } from "../lib/contract";
import { useTx } from "../hooks/useTx";

export default function AdminPanel({ wallet, chainData, notify }) {
  const { account, browserProvider } = wallet;
  const { run, pending } = useTx(notify, chainData.refresh);
  const isAdmin = account && chainData.admin && account.toLowerCase() === chainData.admin.toLowerCase();

  const [kycAddr, setKycAddr] = useState("");
  const [delegateAddr, setDelegateAddr] = useState("");
  const [checkAddr, setCheckAddr] = useState("");
  const [checkResult, setCheckResult] = useState(null);
  const [checking, setChecking] = useState(false);

  const [voteCandidate, setVoteCandidate] = useState("");
  const [topN, setTopN] = useState("1");
  const [candidateCount, setCandidateCount] = useState(null);

  async function verifyParticipant(e) {
    e.preventDefault();
    const signer = await browserProvider.getSigner();
    const contract = getWriteContract(signer);
    const ok = await run(`KYC-verify ${shortAddr(kycAddr)}`, () => contract.verifyParticipant(kycAddr.trim()));
    if (ok) setKycAddr("");
  }

  async function addDelegate(e) {
    e.preventDefault();
    const signer = await browserProvider.getSigner();
    const contract = getWriteContract(signer);
    const ok = await run(`Add delegate ${shortAddr(delegateAddr)}`, () => contract.addDelegate(delegateAddr.trim()));
    if (ok) setDelegateAddr("");
  }

  async function checkStatus(e) {
    e.preventDefault();
    setChecking(true);
    setCheckResult(null);
    try {
      const contract = getReadContract();
      const [kyc, delegate, votes] = await Promise.all([
        contract.kycVerified(checkAddr.trim()),
        contract.delegates(checkAddr.trim()),
        contract.voteCount(checkAddr.trim()),
      ]);
      setCheckResult({ kyc, delegate, votes: Number(votes) });
    } catch (err) {
      notify(`Lookup failed — ${err.message}`, "error");
    } finally {
      setChecking(false);
    }
  }

  async function voteForDelegate(e) {
    e.preventDefault();
    const signer = await browserProvider.getSigner();
    const contract = getWriteContract(signer);
    const ok = await run(`Vote for ${shortAddr(voteCandidate)}`, () => contract.voteForDelegate(voteCandidate.trim()));
    if (ok) setVoteCandidate("");
  }

  async function rotateDelegates(e) {
    e.preventDefault();
    const signer = await browserProvider.getSigner();
    const contract = getWriteContract(signer);
    await run(`Rotate delegates (top ${topN})`, () => contract.rotateDelegates(topN));
  }

  async function loadCandidateCount() {
    try {
      const contract = getReadContract();
      setCandidateCount(Number(await contract.candidateCount()));
    } catch (err) {
      notify(`Lookup failed — ${err.message}`, "error");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {!isAdmin && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          Only the contract admin ({chainData.admin ? shortAddr(chainData.admin) : "—"}) can call these actions.
          You can still submit — the contract will simply reject the transaction if you're not the admin.
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Verify Participant (KYC)" subtitle="Grants an address permission to place orders">
          <form onSubmit={verifyParticipant} className="flex flex-col gap-3">
            <Input
              label="Wallet Address"
              placeholder="0x…"
              value={kycAddr}
              onChange={(e) => setKycAddr(e.target.value)}
              required
            />
            <Button type="submit" disabled={pending}>
              {pending ? "Submitting…" : "Verify Participant"}
            </Button>
          </form>
        </Card>

        <Card title="Add Delegate" subtitle="Grants an address permission to record matches & settle trades">
          <form onSubmit={addDelegate} className="flex flex-col gap-3">
            <Input
              label="Wallet Address"
              placeholder="0x…"
              value={delegateAddr}
              onChange={(e) => setDelegateAddr(e.target.value)}
              required
            />
            <Button type="submit" disabled={pending}>
              {pending ? "Submitting…" : "Add Delegate"}
            </Button>
          </form>
        </Card>
      </div>

      <Card title="Check Status" subtitle="Look up KYC / delegate status for any address">
        <form onSubmit={checkStatus} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Input
              label="Wallet Address"
              placeholder="0x…"
              value={checkAddr}
              onChange={(e) => setCheckAddr(e.target.value)}
              required
            />
          </div>
          <Button type="submit" variant="subtle" disabled={checking}>
            {checking ? "Checking…" : "Check"}
          </Button>
        </form>
        {checkResult && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge tone={checkResult.kyc ? "green" : "neutral"}>{checkResult.kyc ? "KYC Verified" : "Not KYC Verified"}</Badge>
            <Badge tone={checkResult.delegate ? "blue" : "neutral"}>{checkResult.delegate ? "Delegate" : "Not a Delegate"}</Badge>
            <Badge tone="neutral">{checkResult.votes} election vote(s)</Badge>
          </div>
        )}
      </Card>

      <Card
        title="Delegate Election (DPoS-lite)"
        subtitle="Every KYC-verified participant gets one vote; admin rotates the delegate set to the current top vote-getters"
      >
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <form onSubmit={voteForDelegate} className="flex flex-col gap-3">
            <p className="text-xs text-slate-500">Cast (or move) your vote for a delegate candidate.</p>
            <Input
              label="Candidate Address"
              placeholder="0x…"
              value={voteCandidate}
              onChange={(e) => setVoteCandidate(e.target.value)}
              required
            />
            <Button type="submit" variant="subtle" disabled={pending || !account}>
              {pending ? "Submitting…" : "Vote"}
            </Button>
          </form>

          <form onSubmit={rotateDelegates} className="flex flex-col gap-3">
            <p className="text-xs text-slate-500">
              Admin-only: promote the top N vote-getters to delegate status ({candidateCount ?? "?"} candidate(s) so
              far —{" "}
              <button type="button" onClick={loadCandidateCount} className="text-emerald-400 hover:underline">
                refresh
              </button>
              ).
            </p>
            <Input label="Top N" type="number" min="1" value={topN} onChange={(e) => setTopN(e.target.value)} required />
            <Button type="submit" disabled={pending}>
              {pending ? "Submitting…" : "Rotate Delegates"}
            </Button>
          </form>
        </div>
      </Card>
    </div>
  );
}
