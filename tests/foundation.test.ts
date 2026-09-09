import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('vscode', () => {
  const mockOutputChannel = {
    appendLine: vi.fn(),
    dispose: vi.fn(),
  };
  return {
    window: {
      createOutputChannel: vi.fn(() => mockOutputChannel),
    },
  };
});

import { activate, deactivate } from '../src/extension';
import * as vscode from 'vscode';

describe('extension foundation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exports activate as a function', () => {
    expect(typeof activate).toBe('function');
  });

  it('exports deactivate as a function', () => {
    expect(typeof deactivate).toBe('function');
  });

  it('activate creates Route Peek output channel and registers disposal', () => {
    const subscriptions: { dispose(): unknown }[] = [];
    const mockContext = { subscriptions } as unknown as vscode.ExtensionContext;

    activate(mockContext);

    expect(vscode.window.createOutputChannel).toHaveBeenCalledWith('Route Peek');
    expect(subscriptions).toHaveLength(1);
  });

  it('activate logs activation message', () => {
    const subscriptions: { dispose(): unknown }[] = [];
    const mockContext = { subscriptions } as unknown as vscode.ExtensionContext;

    activate(mockContext);

    const channel = (vscode.window.createOutputChannel as ReturnType<typeof vi.fn>).mock.results[0].value;
    expect(channel.appendLine).toHaveBeenCalledWith('Route Peek activated');
  });

  it('deactivate does not throw', () => {
    expect(() => deactivate()).not.toThrow();
  });
});
