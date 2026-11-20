import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { AgentStepsPanel } from "@/components/agent-steps-panel";
import type { AgentEvent } from "@/lib/agent/types";

class MockEventSource {
  static instances: MockEventSource[] = [];
  onmessage: ((message: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  close = vi.fn();

  constructor(readonly url: string) {
    MockEventSource.instances.push(this);
  }

  send(event: AgentEvent) {
    this.onmessage?.({ data: JSON.stringify(event) } as MessageEvent);
  }
}

const citationText = "[1] 图书馆借阅规则 — 图书馆\n依据：凭校园卡或读者码办理借阅。";
const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
const writeText = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  MockEventSource.instances = [];
  writeText.mockClear();
  vi.stubGlobal("EventSource", MockEventSource);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (clipboardDescriptor) Object.defineProperty(navigator, "clipboard", clipboardDescriptor);
  else Reflect.deleteProperty(navigator, "clipboard");
});

describe("AgentStepsPanel citation copy", () => {
  test("copies the exact successful export summary", async () => {
    render(<AgentStepsPanel query="图书馆借书" />);
    expect(MockEventSource.instances[0]?.url).toBe("/api/agent?q=%E5%9B%BE%E4%B9%A6%E9%A6%86%E5%80%9F%E4%B9%A6");
    act(() => {
      MockEventSource.instances[0].send({ type: "tool_result", id: "export-2", name: "export_citations", ok: true, summary: citationText });
    });

    fireEvent.click(screen.getByRole("button", { name: "复制引用" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledExactlyOnceWith(citationText));
  });

  test.each([
    { ok: false, summary: "没有可导出的正文引用。" },
    { ok: true, summary: "" },
    { ok: false, summary: citationText },
  ])("hides copy for non-copyable export %#", ({ ok, summary }) => {
    render(<AgentStepsPanel query="图书馆借书" />);
    act(() => {
      MockEventSource.instances[0].send({ type: "tool_result", id: "export-2", name: "export_citations", ok, summary });
    });
    expect(screen.queryByRole("button", { name: "复制引用" })).not.toBeInTheDocument();
    expect(writeText).not.toHaveBeenCalled();
  });
});
