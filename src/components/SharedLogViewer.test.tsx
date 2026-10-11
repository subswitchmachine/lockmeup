// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { encodeLog, type TaskLog } from '../lib/shareConfig'
import { draftToSpec, newDraft } from '../lib/tasks'
import { SharedLogViewer } from './SharedLogViewer'

afterEach(cleanup)

const sampleLog = (): TaskLog => ({
  v: 1,
  lockedAt: 1_700_000_000_000,
  unlockedAt: 1_700_000_120_000,
  unlockMethod: 'tasks',
  tasks: [draftToSpec(newDraft('wait'))],
  results: [{ kind: 'wait', durationMs: 60_000, errors: 0 }],
})

describe('SharedLogViewer', () => {
  it('starts collapsed with a "View session log" button', () => {
    render(<SharedLogViewer />)
    expect(screen.getByRole('button', { name: 'View session log' })).toBeTruthy()
    expect(screen.queryByText('Paste log code here…')).toBeNull()
  })

  it('expands to a paste form when the trigger is clicked', () => {
    render(<SharedLogViewer />)
    fireEvent.click(screen.getByRole('button', { name: 'View session log' }))
    expect(screen.getByPlaceholderText('Paste log code here…')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Decode' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('enables Decode once the textarea has content', () => {
    render(<SharedLogViewer />)
    fireEvent.click(screen.getByRole('button', { name: 'View session log' }))
    fireEvent.change(screen.getByPlaceholderText('Paste log code here…'), {
      target: { value: 'something' },
    })
    expect((screen.getByRole('button', { name: 'Decode' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('shows the session log when a valid code is decoded', () => {
    render(<SharedLogViewer />)
    fireEvent.click(screen.getByRole('button', { name: 'View session log' }))
    fireEvent.change(screen.getByPlaceholderText('Paste log code here…'), {
      target: { value: encodeLog(sampleLog()) },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Decode' }))
    // SessionLog renders the "Total time" row.
    expect(screen.getByText('Total time')).toBeTruthy()
    expect(screen.getByText('Locked')).toBeTruthy()
  })

  it('extracts the code from a #log= share URL', () => {
    render(<SharedLogViewer />)
    fireEvent.click(screen.getByRole('button', { name: 'View session log' }))
    const code = encodeLog(sampleLog())
    fireEvent.change(screen.getByPlaceholderText('Paste log code here…'), {
      target: { value: `https://example.test/#log=${encodeURIComponent(code)}` },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Decode' }))
    expect(screen.getByText('Total time')).toBeTruthy()
  })

  it('shows an error message for an invalid log code', () => {
    render(<SharedLogViewer />)
    fireEvent.click(screen.getByRole('button', { name: 'View session log' }))
    fireEvent.change(screen.getByPlaceholderText('Paste log code here…'), {
      target: { value: 'totally invalid base64' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Decode' }))
    expect(screen.getByText(/Invalid log code/)).toBeTruthy()
    expect(screen.queryByText('Total time')).toBeNull()
  })

  it('closes back to the trigger and notifies onClose', () => {
    const onClose = vi.fn()
    render(<SharedLogViewer onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'View session log' }))
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'View session log' })).toBeTruthy()
  })

  it('adopts a pre-decoded initialLog without a paste step', async () => {
    render(<SharedLogViewer initialLog={sampleLog()} />)
    // The adoption is deferred via queueMicrotask; flush it.
    await act(async () => {
      await Promise.resolve()
    })
    expect(screen.getByText('Total time')).toBeTruthy()
  })
})
