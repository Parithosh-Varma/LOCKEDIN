import { useCallback, useEffect, useRef, useState } from "react";

/**
 * ACCOUNTABILITY MODULE
 * A = presence check (webcam, blurred locally, never uploaded by default)
 * C = psychological accountability (visible blurred self-view)
 *
 * Screen monitoring: periodic screenshots analyzed LOCALLY for broad signals
 * (page hidden, tab switched, long inactivity). We never read text content.
 * If the browser blocks something, we report the limitation honestly — we
 * never pretend monitoring works when it doesn't.
 */

export type AccountabilityState = {
  webcam: "idle" | "requesting" | "active" | "denied" | "unavailable";
  screen: "idle" | "requesting" | "active" | "denied" | "unavailable";
  videoStream: MediaStream | null;
  lastPresenceCheck: Date | null;
  error: string | null;
};

export function useAccountability(opts: {
  enabled: boolean;
  webcamEnabled: boolean;
  screenEnabled: boolean;
  onFocusBroken: () => void;
  onReturned: () => void;
}) {
  const [state, setState] = useState<AccountabilityState>({
    webcam: "idle",
    screen: "idle",
    videoStream: null,
    lastPresenceCheck: null,
    error: null,
  });

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const wasHidden = useRef(false);
  const lastActivity = useRef(Date.now());
  const startTimeRef = useRef(Date.now());
  const hiddenSince = useRef<number | null>(null);
  const interruptReported = useRef(false);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  // ---- webcam (blur applied via CSS filter, processed locally) ----
  const startWebcam = useCallback(async () => {
    if (!optsRef.current.webcamEnabled) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setState((s) => ({ ...s, webcam: "unavailable", error: "Camera API not available in this browser." }));
      return;
    }
    setState((s) => ({ ...s, webcam: "requesting" }));
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 160, height: 120, facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => undefined);
      }
      setState((s) => ({ ...s, webcam: "active", videoStream: stream, lastPresenceCheck: new Date(), error: null }));
    } catch (e) {
      setState((s) => ({ ...s, webcam: "denied", error: "Camera permission denied. Presence check is off — you're on your own honour." }));
    }
  }, []);

  const stopWebcam = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setState((s) => ({ ...s, webcam: "idle", videoStream: null }));
  }, []);

  // ---- screen capture (periodic screenshots, local-only analysis) ----
  const startScreen = useCallback(async () => {
    if (!optsRef.current.screenEnabled) return;
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setState((s) => ({ ...s, screen: "unavailable", error: "Screen capture not supported here. Tab-switch detection still active." }));
      return;
    }
    setState((s) => ({ ...s, screen: "requesting" }));
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      screenStreamRef.current = stream;
      // We never record/store frames by default. Stream exists to keep the
      // capture permission grant alive so we can detect the tab state.
      stream.getVideoTracks()[0].addEventListener("ended", () => {
        setState((s) => ({ ...s, screen: "idle" }));
      });
      setState((s) => ({ ...s, screen: "active" }));
    } catch {
      setState((s) => ({ ...s, screen: "denied", error: "Screen capture denied. Tab-switch detection remains active." }));
    }
  }, []);

  const stopScreen = useCallback(() => {
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current = null;
    setState((s) => ({ ...s, screen: "idle" }));
  }, []);

  // ---- interruption detection ----
  const reportInterruption = useCallback(() => {
    if (interruptReported.current) return;
    interruptReported.current = true;
    optsRef.current.onFocusBroken();
  }, []);

  const handleVisibility = useCallback(() => {
    const visible = document.visibilityState === "visible";
    if (!visible) {
      if (!wasHidden.current) {
        wasHidden.current = true;
        hiddenSince.current = Date.now();
        reportInterruption();
      }
    } else {
      if (wasHidden.current) {
        wasHidden.current = false;
        const awayMs = hiddenSince.current ? Date.now() - hiddenSince.current : 0;
        hiddenSince.current = null;
        interruptReported.current = false;
        if (awayMs > 2000) optsRef.current.onReturned();
      }
    }
  }, [reportInterruption]);

  const handleBlur = useCallback(() => {
    // window blur = user switched apps/tabs (on most desktop browsers)
    if (!wasHidden.current) {
      wasHidden.current = true;
      hiddenSince.current = Date.now();
      reportInterruption();
    }
  }, [reportInterruption]);

  const handleFocus = useCallback(() => {
    if (wasHidden.current) {
      wasHidden.current = false;
      hiddenSince.current = null;
      interruptReported.current = false;
      optsRef.current.onReturned();
    }
  }, []);

  useEffect(() => {
    if (!optsRef.current.enabled) return;
    startTimeRef.current = Date.now();
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("blur", handleBlur);
    window.addEventListener("focus", handleFocus);

    // inactivity: after 5 minutes of no interaction, report focus broken
    const inact = setInterval(() => {
      if (Date.now() - lastActivity.current > 5 * 60_000) {
        reportInterruption();
      }
    }, 30_000);

    const markActive = () => {
      lastActivity.current = Date.now();
    };
    ["mousemove", "keydown", "click", "scroll"].forEach((ev) => window.addEventListener(ev, markActive));

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("focus", handleFocus);
      clearInterval(inact);
      ["mousemove", "keydown", "click", "scroll"].forEach((ev) => window.removeEventListener(ev, markActive));
    };
  }, [handleVisibility, handleBlur, handleFocus, reportInterruption]);

  return {
    state,
    videoRef,
    startWebcam,
    stopWebcam,
    startScreen,
    stopScreen,
  };
}

/** FOCUS LOCK overlay state + warning before unload */
export function useFocusLock(enabled: boolean, onBreak: () => void) {
  const [locked, setLocked] = useState(enabled);
  const armed = useRef(false);

  useEffect(() => {
    setLocked(enabled);
    if (!enabled) return;
    const before = (e: BeforeUnloadEvent) => {
      onBreak();
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", before);
    return () => window.removeEventListener("beforeunload", before);
  }, [enabled, onBreak]);

  return { locked, setLocked, arm: () => (armed.current = true) };
}

/** YOUTUBE STUDY MUSIC — respects autoplay restrictions. */
export function useStudyMusic(url: string | null, enabled: boolean, volume: number) {
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [autoplayFailed, setAutoplayFailed] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const urlRef = useRef(url);
  urlRef.current = url;

  const embedUrl = useCallback((u: string): string | null => {
    const m = u.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([\w-]{11})/);
    if (!m) return null;
    return `https://www.youtube.com/embed/${m[1]}?enablejsapi=1&autoplay=0&rel=0`;
  }, []);

  const play = useCallback(() => {
    if (!urlRef.current) return;
    const embed = embedUrl(urlRef.current);
    if (!embed) return;
    // attempt programmatic play; browsers will likely block first click
    const iframe = iframeRef.current;
    if (iframe && (iframe.contentWindow as any)?.postMessage) {
      try {
        (iframe.contentWindow as any).postMessage(
          JSON.stringify({ event: "command", func: "playVideo", args: [] }),
          "*"
        );
        setPlaying(true);
      } catch {
        setAutoplayFailed(true);
      }
    } else {
      setAutoplayFailed(true);
    }
  }, [embedUrl]);

  const pause = useCallback(() => {
    const iframe = iframeRef.current;
    if (iframe && (iframe.contentWindow as any)?.postMessage) {
      try {
        (iframe.contentWindow as any).postMessage(
          JSON.stringify({ event: "command", func: "pauseVideo", args: [] }),
          "*"
        );
        setPlaying(false);
      } catch {
        /* noop */
      }
    }
  }, []);

  useEffect(() => {
    if (enabled && url) {
      // iframe loads with autoplay=0; user must click once (browser policy)
      setAutoplayFailed(true);
    }
  }, [enabled, url]);

  return { playing, setPlaying, muted, setMuted, autoplayFailed, iframeRef, urlRef, embedUrl, play, pause };
}