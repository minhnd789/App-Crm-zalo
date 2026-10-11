import { useEffect, useRef, useState } from 'react';
import { Alert, Modal, Spin } from 'antd';

const REGION_ID = 'qr-scan-region';

/** Quét mã QR thành viên bằng camera (html5-qrcode, tải động khi mở) */
export function QrScanModal({ open, onClose, onResult }: { open: boolean; onClose: () => void; onResult: (text: string) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  useEffect(() => {
    if (!open) return;
    let stopped = false;
    let scanner: { stop: () => Promise<void>; clear: () => void; isScanning: boolean } | null = null;
    setError(null);
    setStarting(true);
    // chờ Modal render xong vùng quét
    const timer = setTimeout(async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode');
        if (stopped) return;
        const s = new Html5Qrcode(REGION_ID, { verbose: false });
        scanner = s;
        await s.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          (text) => {
            if (stopped) return;
            stopped = true;
            void s.stop().catch(() => undefined);
            onResultRef.current(text);
          },
          () => undefined,
        );
      } catch (e) {
        if (!stopped) setError(`Không mở được camera: ${e instanceof Error ? e.message : String(e)}. Hãy nhập SĐT hoặc mã thành viên thủ công.`);
      } finally {
        setStarting(false);
      }
    }, 150);
    return () => {
      stopped = true;
      clearTimeout(timer);
      if (scanner?.isScanning) void scanner.stop().catch(() => undefined);
    };
  }, [open]);

  return (
    <Modal title="Quét mã QR thành viên" open={open} onCancel={onClose} footer={null} destroyOnHidden width={420}>
      {error ? <Alert type="warning" showIcon message={error} style={{ marginBottom: 12 }} /> : null}
      <Spin spinning={starting}>
        <div id={REGION_ID} style={{ width: '100%', minHeight: error ? 0 : 280, background: error ? undefined : '#000', borderRadius: 8, overflow: 'hidden' }} />
      </Spin>
      <div style={{ marginTop: 8, color: '#8c8c8c', fontSize: 12 }}>Đưa mã QR trong mục "Thẻ thành viên" trên Mini App của khách vào khung hình.</div>
    </Modal>
  );
}
