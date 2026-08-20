"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Modal } from "@/components/ui";
import { parseEquipmentQrValue } from "@/lib/equipment-qr";

type DetectedBarcode = { rawValue: string };
type BarcodeDetectorInstance = {
  detect: (source: ImageBitmapSource) => Promise<DetectedBarcode[]>;
};
type BarcodeDetectorCtor = {
  new (opts?: { formats?: string[] }): BarcodeDetectorInstance;
};

function getBarcodeDetector(): BarcodeDetectorCtor | null {
  if (typeof window === "undefined") return null;
  return (
    (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor })
      .BarcodeDetector ?? null
  );
}

export function EquipmentQrScannerModal({
  open,
  onClose,
  onToken,
}: {
  open: boolean;
  onClose: () => void;
  onToken: (token: string) => Promise<string | null>;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lockRef = useRef(false);
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;
  const [cameraError, setCameraError] = useState("");
  const [scanError, setScanError] = useState("");
  const [checking, setChecking] = useState(false);
  const [manual, setManual] = useState("");
  const supported = !!getBarcodeDetector();

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    const video = videoRef.current;
    if (video) video.srcObject = null;
  }, []);

  const handleToken = useCallback(async (raw: string) => {
    if (lockRef.current) return;
    const token = parseEquipmentQrValue(raw);
    if (!token) {
      setScanError("Это не QR единицы оборудования");
      return;
    }
    lockRef.current = true;
    setChecking(true);
    setScanError("");
    try {
      const error = await onTokenRef.current(token);
      if (error) {
        setScanError(error);
        lockRef.current = false;
      }
    } catch {
      setScanError("Не удалось проверить QR");
      lockRef.current = false;
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    if (!open) {
      stopCamera();
      lockRef.current = false;
      setCameraError("");
      setScanError("");
      setChecking(false);
      setManual("");
      return;
    }

    const Ctor = getBarcodeDetector();
    if (!Ctor) return;

    let cancelled = false;
    let timer = 0;

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: "environment" } },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        const detector = new Ctor({ formats: ["qr_code"] });
        const tick = async () => {
          if (cancelled || lockRef.current) {
            timer = window.setTimeout(tick, 280);
            return;
          }
          try {
            if (video.readyState >= 2) {
              const codes = await detector.detect(video);
              const raw = codes[0]?.rawValue;
              if (raw) {
                await handleToken(raw);
              }
            }
          } catch {
            // кадр ещё не готов
          }
          if (!cancelled) timer = window.setTimeout(tick, 280);
        };
        timer = window.setTimeout(tick, 280);
      } catch {
        if (!cancelled) {
          setCameraError(
            "Нет доступа к камере. Разрешите её в браузере или загрузите фото QR.",
          );
        }
      }
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      stopCamera();
    };
  }, [open, handleToken, stopCamera]);

  async function onFile(file: File | undefined) {
    if (!file) return;
    const Ctor = getBarcodeDetector();
    if (!Ctor) {
      setScanError("Сканер QR недоступен в этом браузере");
      return;
    }
    try {
      const bitmap = await createImageBitmap(file);
      const detector = new Ctor({ formats: ["qr_code"] });
      const codes = await detector.detect(bitmap);
      bitmap.close();
      const raw = codes[0]?.rawValue;
      if (!raw) {
        setScanError("На фото QR не найден");
        return;
      }
      await handleToken(raw);
    } catch {
      setScanError("Не удалось прочитать фото");
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!checking) onClose();
      }}
      title="Сканер QR"
      className="max-w-md"
    >
      <p className="mt-1 text-sm text-[var(--muted)]">
        Наведите камеру на QR единицы. Если прибора ещё нет в ремонте —
        откроется списание; если уже списан — найдём его в списке.
      </p>
      {supported ? (
        <div className="relative mt-3 overflow-hidden rounded-xl bg-black">
          <video
            ref={videoRef}
            className="aspect-[3/4] w-full object-cover sm:aspect-video"
            playsInline
            muted
            autoPlay
          />
          <div
            className="pointer-events-none absolute inset-[18%] rounded-lg border-2 border-white/80"
            aria-hidden
          />
          {checking ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-sm text-white">
              Проверяем…
            </div>
          ) : null}
        </div>
      ) : (
        <p className="mt-3 rounded-lg border border-[var(--line)] bg-[var(--panel-muted)] px-3 py-2 text-sm text-[var(--muted)]">
          Этот браузер не умеет сканировать QR с камеры. Откройте Chrome или
          Safari либо вставьте ссылку с наклейки.
        </p>
      )}
      {cameraError ? (
        <p className="mt-2 text-sm text-[var(--danger)]">{cameraError}</p>
      ) : null}
      {scanError ? (
        <p className="mt-2 text-sm text-[var(--danger)]">{scanError}</p>
      ) : null}
      <div className="mt-3 flex flex-col gap-2">
        <label className="text-sm text-[var(--muted)]">
          Фото QR
          <input
            className="field mt-1"
            type="file"
            accept="image/*"
            capture="environment"
            disabled={checking}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              void onFile(file);
            }}
          />
        </label>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void handleToken(manual);
          }}
        >
          <input
            className="field flex-1"
            placeholder="Или вставьте ссылку /q/…"
            value={manual}
            disabled={checking}
            onChange={(e) => setManual(e.target.value)}
          />
          <Button type="submit" variant="secondary" size="sm" disabled={checking}>
            Найти
          </Button>
        </form>
      </div>
      <div className="mt-4 flex justify-end">
        <Button variant="ghost" size="sm" disabled={checking} onClick={onClose}>
          Закрыть
        </Button>
      </div>
    </Modal>
  );
}
