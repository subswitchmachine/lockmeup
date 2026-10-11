import { useEffect } from 'react'

interface AboutModalProps {
  onClose: () => void
}

export function AboutModal({ onClose }: AboutModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="modal-title" id="about-title">
          Welcome to lockmeup
        </h2>
        <div className="about-body">
          <h3>What is lockmeup?</h3>
          <p>
            lockmeup is a self-locking puzzle app. You design a session — a series of tasks a
            person must complete before they can see the combination to whatever they've locked
            away. Once locked, the combination is hidden until every task is finished.
          </p>

          <h3>How it works</h3>
          <ol>
            <li>
              <strong>Design</strong> — build a flow of tasks: puzzles, timers, typing, steady-hand
              challenges and more.
            </li>
            <li>
              <strong>Capture</strong> — set a new combination on your lock and photograph it
              without looking.
            </li>
            <li>
              <strong>Unlock</strong> — the photo is encrypted and only revealed once every task is
              done, or the optional max session time runs out.
            </li>
          </ol>

          <h3>Privacy</h3>
          <p>
            Everything happens entirely on your device. No data is ever sent to a server — not the
            photos, not the tasks, not the session log. The combination is stored locally using the
            Web Crypto API and never leaves your browser.
          </p>
          <p>
            Shareable assignment codes and session logs are self-contained strings you can copy and
            paste yourself. Nothing is uploaded anywhere.
          </p>
          <p>
            Since I have no server or tracking I can't know who or how many people are using it.
            If you are enjoying it or have requests, join me on <a href="https://discord.gg/83yjSnGMQe">discord</a>
          </p>

          <h3>Security limitations</h3>
          <p>
            The lock is a <em>commitment device</em>. Although I have
            made it as tricky as possible, a technically savvy person who knows what they're doing
            <em> could</em> bypass it.
          </p>

          <h3>Open source</h3>
          <p>
            lockmeup is free and open source under the AGPL-3.0 licence. You can read the code,
            check the privacy claims above for yourself, report a bug or suggest a change on{' '}
            <a
              href="https://github.com/subswitchmachine/lockmeup"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub
            </a>
            .
          </p>
        </div>
        <div className="modal-actions">
          <button type="button" className="primary" onClick={onClose} autoFocus>
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}
