"use client";

import { useEffect, useState } from "react";
import { getConsent, setConsent } from "@/lib/firebase";

export default function ConsentBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (getConsent() === null) setShow(true);
  }, []);

  if (!show) return null;

  const accept = () => { setConsent("granted"); setShow(false); };
  const decline = () => { setConsent("denied"); setShow(false); };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6 flex flex-col gap-5">
        <div>
          <p className="font-semibold text-sm text-[#0F172A] mb-2">Before you start</p>
          <p className="text-xs text-[#475569] leading-relaxed">
            This tool collects anonymous usage events (e.g. which features you use)
            via Firebase Analytics to help improve it. No personal data, no
            cross-site tracking.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <button
            onClick={accept}
            className="w-full py-2.5 text-sm rounded-lg bg-[#0A66C2] text-white hover:bg-[#004182] transition-colors font-medium"
          >
            Accept analytics
          </button>
          <button
            onClick={decline}
            className="w-full py-2.5 text-sm rounded-lg border border-[#CBD5E1] text-[#475569] hover:bg-[#F8FAFC] transition-colors"
          >
            Decline — continue without analytics
          </button>
        </div>
      </div>
    </div>
  );
}
