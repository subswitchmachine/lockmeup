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

          <h3>Play safe</h3>
          <p>
            If you use lockmeup for self-bondage, <strong>always have a backup way out that
            doesn't depend on this app</strong>. Browser data can be cleared, a battery can die, a
            photo can come out unreadable, and software has bugs — any of these could leave the
            combination out of reach for good.
          </p>
          <ul>
            <li>
              Keep an emergency release within reach: a spare key or the written combination in a
              sealed envelope or tamper-evident container, or safety shears or cutters that can
              defeat whatever is holding you.
            </li>
            <li>
              Test the backup before you lock, and make sure you can reach and use it from the
              position you'll actually be in.
            </li>
            <li>
              Never use anything that restricts breathing or circulation, and never play while
              intoxicated. Keep a phone within reach, and ideally tell someone you trust.
            </li>
            <li>
              Set a max session time, and only lock yourself into something you could safely stay
              in for much longer than you plan to.
            </li>
          </ul>
          <p>You use lockmeup at your own risk.</p>

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

          <h3>AI disclosure</h3>
          <p>
            Much of lockmeup's code was written with the help of AI coding tools. I'm a
            professional software engineer and I have reviewed the AI-written code myself.
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
