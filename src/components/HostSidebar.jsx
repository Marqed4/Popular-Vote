import { useEffect, useRef } from "react";
import QRCode from "qrcode";
import "./HostSidebar.css";

function QRDisplay({ url }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    if (!canvasRef.current || !url) return;
    QRCode.toCanvas(canvasRef.current, url, {
      width: 160,
      margin: 1,
      color: { dark: "#1c1917", light: "#ffffff" },
    });
  }, [url]);
  return <canvas ref={canvasRef} className="hd-qr-canvas" />;
}

export default function HostSidebar({
  code,
  phase,
  tags,
  tagInput,
  error,
  actionLoading,
  previewLoading,
  expandLoading,
  canRecluster,
  onTagInput,
  onAddTag,
  onRemoveTag,
  onClose,
  onCluster,
  onPreviewExpansion,
  onTriggerExpansion,
  onEndSession,
  onDeleteSession,
}) {
  function copyCode() { navigator.clipboard.writeText(code); }
  function copyLink() { navigator.clipboard.writeText(`${window.location.origin}?code=${code}`); }

  const sessionUrl = `${window.location.origin}?code=${code}`;

  return (
    <aside className="hd-sidebar">
      <section className="hd-card">
        <div className="hd-card-title">Session Code</div>
        <div className="hd-code">{code}</div>
        <div className="hd-code-actions">
          <button className="hd-btn-ghost" onClick={copyCode}>Copy code</button>
          <button className="hd-btn-ghost" onClick={copyLink}>Copy link</button>
        </div>
        <QRDisplay url={sessionUrl} />
        <div className="hd-url">{sessionUrl}</div>
      </section>

      <section className="hd-card">
        <div className="hd-card-title">Tags</div>
        <div className="hd-tags">
          {tags.map(t => (
            <span key={t} className="hd-tag">
              {t}
              {phase === "OPEN" && (
                <button className="hd-tag-remove" onClick={() => onRemoveTag(t)}>×</button>
              )}
            </span>
          ))}
        </div>
        {phase === "OPEN" && (
          <input
            className="hd-tag-input"
            placeholder="Add tag, press Enter…"
            value={tagInput}
            onChange={e => onTagInput(e.target.value)}
            onKeyDown={onAddTag}
          />
        )}
      </section>

      <section className="hd-card hd-actions">
        <div className="hd-card-title">Actions</div>
        {error && <div className="hd-error">{error}</div>}

        {phase === "OPEN" && (
          <button className="hd-btn-primary" onClick={onClose} disabled={actionLoading}>
            {actionLoading ? "Closing…" : "Close Submissions"}
          </button>
        )}

        {(phase === "OPEN" || phase === "CLOSED") && (
          <button
            className={phase === "OPEN" ? "hd-btn-ghost hd-btn-ghost--full" : "hd-btn-primary"}
            onClick={onCluster}
            disabled={actionLoading}
          >
            {actionLoading ? "Clustering…" : "Trigger Clustering"}
          </button>
        )}

        {phase === "CLUSTERING" && (
          <div className="hd-clustering-status">
            <div className="hd-spinner" />
            <span>Clustering in progress…</span>
          </div>
        )}

        {phase === "RESULTS" && (
          <>
            <button className="hd-btn-primary" onClick={onCluster} disabled={actionLoading || !canRecluster}>
              {actionLoading ? "Clustering…" : "Re-cluster"}
            </button>
            <button className="hd-btn-end" onClick={onEndSession} disabled={actionLoading}>
              {actionLoading ? "Ending…" : "End Session"}
            </button>
          </>
        )}

        {phase === "EXPANDING" && (
          <>
            <button className="hd-btn-primary" onClick={onClose} disabled={actionLoading}>
              {actionLoading ? "Closing…" : "Close Submissions"}
            </button>
            <button className="hd-btn-primary" onClick={onCluster} disabled={actionLoading}>
              {actionLoading ? "Clustering…" : "Trigger Clustering"}
            </button>
          </>
        )}

        {phase === "ENDED" && (
          <>
            <div className="hd-ended-msg">Session has ended.</div>
            <button className="hd-btn-end" onClick={onDeleteSession}>
              Delete Session
            </button>
          </>
        )}
      </section>

    </aside>
  );
}