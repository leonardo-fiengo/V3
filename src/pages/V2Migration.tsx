import { useState } from "react";
import { Check, FolderOpen, ShieldCheck } from "lucide-react";
import { api, errorOf, pickFile } from "../lib/api";
import { useApp } from "../context";
import { Amount, Confirm, InlineError, Modal } from "../components/ui";
import type { AppError, MigrationPreview } from "../lib/types";
export function V2Flow({ onClose }: { onClose: () => void }) {
  const { refresh, notify } = useApp();
  const [preview, setPreview] = useState<MigrationPreview | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  return (
    <Modal
      title="Bring your V2 history home"
      description="We inspect your source and compare financial results before activation."
      onClose={() => {
        if (!busy) onClose();
      }}
      wide
    >
      <p className="info-note">
        Select a copy of the V2 SQLite database while V2 is closed. The adapter
        supports the inspected integer-minor-unit schema. Unsupported financial
        data blocks migration for review.
      </p>
      <button
        className="button secondary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            const path = await pickFile("v2");
            if (path) setPreview(await api({ op: "preview_v2", path }));
          } catch (e) {
            setError(errorOf(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <FolderOpen size={16} />
        {busy ? "Inspecting and comparing…" : "Select V2 database"}
      </button>
      {preview ? (
        <>
          <h3 className="migration-heading">
            {preview.source} · {preview.transaction_count} transactions
          </h3>
          {preview.warnings.map((w, i) => (
            <p className="field-hint" key={i}>
              {w}
            </p>
          ))}
          {preview.blockers.length ? (
            <div className="migration-blockers" role="alert">
              <h3>Migration needs further review</h3>
              {preview.blockers.map((b, i) => (
                <p key={i}>{b}</p>
              ))}
              <p>
                No migrated vault can be activated while these issues remain.
              </p>
            </div>
          ) : (
            <p className="migration-success">
              <ShieldCheck size={18} />
              All supported balances and period totals agree.
            </p>
          )}
          {preview.accounts.length ? (
            <div className="table-wrap">
              <table>
                <caption>Account balance comparison</caption>
                <thead>
                  <tr>
                    <th>Account</th>
                    <th className="right">V2 balance</th>
                    <th className="right">V3 balance</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.accounts.map((a) => (
                    <tr key={a.name}>
                      <td>{a.name}</td>
                      <td className="right">
                        <Amount value={a.before} />
                      </td>
                      <td className="right">
                        <Amount value={a.after} />
                      </td>
                      <td>{a.matches ? "Matches" : "Review required"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {preview.periods.length ? (
            <div className="table-wrap import-table">
              <table>
                <caption>Period total comparison</caption>
                <thead>
                  <tr>
                    <th>Month</th>
                    <th>V2 income</th>
                    <th>V3 income</th>
                    <th>V2 expenses</th>
                    <th>V3 expenses</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.periods.map((p) => (
                    <tr key={p.month}>
                      <td>{p.month}</td>
                      <td>
                        <Amount value={p.source_income} />
                      </td>
                      <td>
                        <Amount value={p.migrated_income} />
                      </td>
                      <td>
                        <Amount value={p.source_expenses} />
                      </td>
                      <td>
                        <Amount value={p.migrated_expenses} />
                      </td>
                      <td>{p.matches ? "Matches" : "Review required"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          <div className="modal-actions">
            <button
              className="button primary"
              disabled={!!preview.blockers.length || busy}
              onClick={() => setConfirm(true)}
            >
              Activate migrated vault
              <Check size={16} />
            </button>
          </div>
        </>
      ) : null}
      <InlineError error={error} />
      {confirm ? (
        <Confirm
          title="Activate the migrated V2 vault?"
          description="The reviewed migration will replace this vault’s contents. An encrypted safety copy is kept first, and your V2 file is unchanged. Continue only after reviewing all warnings and comparisons."
          label="Activate migration"
          onClose={() => setConfirm(false)}
          onConfirm={async () => {
            await api({ op: "commit_v2", token: preview!.token });
            await refresh();
            notify(
              "V2 migration activated. Balances and period totals were verified.",
            );
            onClose();
          }}
        />
      ) : null}
    </Modal>
  );
}
