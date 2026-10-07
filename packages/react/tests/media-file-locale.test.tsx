// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { AgentUILocaleProvider, type AgentUILocaleCode } from "../src/locale";
import { ConversationFile } from "../src/public";
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
afterEach(async () => { await act(async () => root?.unmount()); document.body.replaceChildren(); vi.restoreAllMocks(); });
async function mount(mimeType: string, filename?: string, data = "YWJj") {
 const el = document.createElement("div"); document.body.append(el); root = createRoot(el);
 const render = async (locale: AgentUILocaleCode) => { await act(async () => root.render(<AgentUILocaleProvider locale={locale}><ConversationFile data={data} mimeType={mimeType} {...(filename === undefined ? {} : {filename})} /></AgentUILocaleProvider>)); };
 await render("zh-CN"); return {el,render};
}
it("localizes audio controls without replacing the player or losing playback and seek state", async () => {
 vi.spyOn(HTMLMediaElement.prototype,"play").mockResolvedValue();
 const pause = vi.spyOn(HTMLMediaElement.prototype,"pause").mockImplementation(() => {});
 const {el,render} = await mount("audio/wav", "recording $&.wav");
 const audio = el.querySelector("audio")!;
 Object.defineProperty(audio,"duration",{configurable:true,value:120});
 await act(async () => audio.dispatchEvent(new Event("loadedmetadata")));
 const button = el.querySelector("button")!;
 expect(button.getAttribute("aria-label")).toBe("播放 recording $&.wav");
 await act(async () => button.click());
 await act(async () => {audio.currentTime=35;audio.dispatchEvent(new Event("timeupdate"));});
 const range = el.querySelector("input")!;
 expect(range.getAttribute("aria-valuetext")).toBe("0:35，共 2:00");
 await render("en-US");
 expect(el.querySelector("audio")).toBe(audio); expect(audio.currentTime).toBe(35);
 expect(button.getAttribute("aria-label")).toBe("Pause recording $&.wav");
 expect(range.getAttribute("aria-label")).toBe("Seek");
 expect(range.getAttribute("aria-valuetext")).toBe("0:35 of 2:00");
 await act(async () => button.click()); expect(pause).toHaveBeenCalledOnce();
 await act(async () => audio.dispatchEvent(new Event("error")));
 expect(el.querySelector('[role="alert"]')?.textContent?.trim()).toBe("Can't play this audio");
 await render("zh-CN"); expect(button.disabled).toBe(true);
 expect(el.querySelector('[role="alert"]')?.textContent?.trim()).toBe("无法播放此音频");
 expect(el.querySelector("a")?.getAttribute("href")).toBe("data:audio/wav;base64,YWJj");
});
it.each(["audio/wav","video/mp4","application/pdf"])("localizes unnamed %s and encoded download labels while preserving payload",async mimeType => {
 const {el,render} = await mount(mimeType);
 const anchor=el.querySelector("a")!;
 expect(anchor.getAttribute("aria-label")).toBe("下载 未命名文件");
 expect(anchor.getAttribute("href")).toBe(`data:${mimeType};base64,YWJj`);
 if(mimeType.startsWith("video")) expect(el.querySelector("video")?.getAttribute("aria-label")).toBe("视频");
 await render("en-US");expect(el.querySelector("a")).toBe(anchor);
 expect(anchor.getAttribute("aria-label")).toBe("Download Unnamed file");
 if(mimeType.startsWith("video")) expect(el.querySelector("video")?.getAttribute("aria-label")).toBe("Video");
 if(mimeType === "application/pdf") expect(el.textContent).toContain("Unnamed file");
});
it("preserves file URL rejection for unsafe schemes",async()=> {
 const {el}=await mount("video/mp4",undefined,"javascript:alert(1)");expect(el.querySelector("video")).toBeNull();expect(el.querySelector("a")).toBeNull();
});
