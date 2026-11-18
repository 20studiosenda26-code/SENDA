import { useEffect, useState } from 'react';
import { ExternalLink, FileVideo } from 'lucide-react';
import { extractGoogleDriveId, fetchDriveFileName, isGoogleDriveUrl } from '../lib/supabaseClient';

/** Dice con claridad QUÉ se está viendo: tipo, versión y nombre real del archivo en Drive.
 *  Así admin, Clipper y cliente pueden comprobar que hablan del mismo video. */
export function MediaIdentity({ label, url }: { label: string; url?: string | null }) {
  const [name, setName] = useState<string | null>(null);
  const isDrive = Boolean(url && isGoogleDriveUrl(url));
  useEffect(() => {
    let off = false;
    setName(null);
    if (isDrive) void fetchDriveFileName(url).then(n => { if (!off) setName(n); });
    return () => { off = true; };
  }, [url, isDrive]);
  const id = isDrive ? extractGoogleDriveId(url) : null;
  return (
    <div className="flex items-center gap-2 flex-wrap text-[11px] text-muted bg-surface-3/60 border border-line rounded-lg px-3 py-2">
      <FileVideo size={13} className="text-accent shrink-0" />
      <span className="text-text font-medium">{label}</span>
      {name && <span className="font-tech text-muted-2 truncate max-w-[320px]" title={name}>· {name}</span>}
      {id && (
        <a href={`https://drive.google.com/file/d/${id}/view`} target="_blank" rel="noreferrer"
          className="ml-auto text-accent hover:text-accent-strong flex items-center gap-1">
          Abrir en Drive <ExternalLink size={11} />
        </a>
      )}
    </div>
  );
}
