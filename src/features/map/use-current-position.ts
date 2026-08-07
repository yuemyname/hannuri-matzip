"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FALLBACK_CENTER } from "./config";

// SPEC §5. 상태 머신: idle → prompting → granted | denied | unavailable | timeout
export type PositionStatus =
  "idle" | "prompting" | "granted" | "denied" | "unavailable" | "timeout";

export type Coords = { lat: number; lng: number; accuracy: number };

const CACHE_KEY = "hannuri-matzip:position";
const CACHE_MS = 60_000; // SPEC §5 "sessionStorage 에 캐시(1분)"
const LOW_ACCURACY_M = 200; // 이보다 부정확하면 힌트를 띄운다

const OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 8000,
  maximumAge: 60_000,
};

function readCache(): Coords | null {
  // Safari 프라이빗 모드는 sessionStorage 접근만으로도 던진다.
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const v: unknown = JSON.parse(raw);
    if (typeof v !== "object" || v === null) return null;
    const { lat, lng, accuracy, ts } = v as Record<string, unknown>;
    if (
      typeof lat !== "number" ||
      typeof lng !== "number" ||
      typeof accuracy !== "number" ||
      typeof ts !== "number"
    ) {
      return null;
    }
    if (Date.now() - ts > CACHE_MS) return null;
    return { lat, lng, accuracy };
  } catch {
    return null;
  }
}

function writeCache(c: Coords) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ...c, ts: Date.now() }));
  } catch {
    // 캐시는 있으면 좋은 것일 뿐이다. 실패해도 그냥 넘어간다.
  }
}

/**
 * 현재 위치. 실패해도 항상 `center` 는 존재한다 — 못 얻으면 사무실 폴백 좌표다.
 *
 * 진입하자마자 프롬프트를 띄우지 않는다. iOS Safari 는 사용자 제스처 없이 호출하면
 * 프롬프트를 무시하는 경우가 있어서, `request()` 를 버튼에 걸어 쓰는 게 기본이다 (SPEC §5).
 * 이미 권한이 허용된 브라우저에서만 자동으로 한 번 시도한다 — 이 경우 프롬프트가 안 뜬다.
 */
export function useCurrentPosition() {
  const [status, setStatus] = useState<PositionStatus>("idle");
  const [coords, setCoords] = useState<Coords | null>(null);
  const inFlight = useRef(false);

  const request = useCallback(() => {
    if (inFlight.current) return;

    if (typeof window === "undefined" || !navigator.geolocation) {
      setStatus("unavailable");
      return;
    }
    // HTTPS 아니면 브라우저가 아예 거부한다 (localhost 는 예외). SPEC §5
    if (!window.isSecureContext) {
      setStatus("unavailable");
      return;
    }

    inFlight.current = true;
    setStatus("prompting");

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        inFlight.current = false;
        const next: Coords = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        };
        setCoords(next);
        setStatus("granted");
        writeCache(next);
      },
      (err) => {
        inFlight.current = false;
        if (err.code === err.PERMISSION_DENIED) setStatus("denied");
        else if (err.code === err.TIMEOUT) setStatus("timeout");
        else setStatus("unavailable");
      },
      OPTIONS,
    );
  }, []);

  useEffect(() => {
    const cached = readCache();
    if (cached) {
      setCoords(cached);
      setStatus("granted");
      return;
    }

    // 이미 허용된 브라우저면 프롬프트 없이 바로 받아온다.
    // Permissions API 는 지원이 고르지 않으므로 실패하면 그냥 idle 로 둔다.
    let cancelled = false;
    navigator.permissions
      ?.query({ name: "geolocation" })
      .then((p) => {
        if (!cancelled && p.state === "granted") request();
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [request]);

  return {
    status,
    coords,
    /** 지도 중심. granted 면 실제 위치, 아니면 사무실 폴백 */
    center: coords ? { lat: coords.lat, lng: coords.lng } : FALLBACK_CENTER,
    /** 폴백 좌표를 쓰고 있는지 — 배너를 띄울지 판단한다 */
    isFallback: status !== "granted",
    /** 정확도 200m 초과 (SPEC §5) */
    lowAccuracy: coords !== null && coords.accuracy > LOW_ACCURACY_M,
    request,
  };
}
