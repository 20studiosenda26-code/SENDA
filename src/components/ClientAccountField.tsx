import { Check, UserCircle2 } from 'lucide-react';
import { useState } from 'react';
import { useStore } from '../store';
import type { Order } from '../types';

/** Vincula un pedido a la cuenta de su cliente (rol "cliente") para que lo vea en su portal. */
export function ClientAccountField({ order }: { order: Order }) {
  const { clientProfiles, updateOrder, setView } = useStore();
  const [flash, setFlash] = useState(false);
  const current = clientProfiles.find(c => c.id === order.clientId) || null;

  return (
    <div className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 ${current ? 'bg-accent/5 border-accent/30' : 'bg-surface-3 border-line border-dashed'}`} onClick={e => e.stopPropagation()}>
      <UserCircle2 size={14} className={current ? 'text-accent shrink-0' : 'text-muted-2 shrink-0'} />
      <span className="text-xs text-muted shrink-0">Cliente:</span>
      {clientProfiles.length === 0 ? (
        <button type="button" onClick={() => setView('administracion')} className="text-xs text-accent hover:underline">
          Crea primero una cuenta con rol Cliente
        </button>
      ) : (
        <select
          value={order.clientId || ''}
          onChange={e => {
            updateOrder(order.id, { clientId: e.target.value || null });
            setFlash(true);
            setTimeout(() => setFlash(false), 1500);
          }}
          className="flex-1 min-w-0 bg-transparent text-xs font-medium outline-none cursor-pointer"
        >
          <option value="">Sin vincular (el cliente no lo ve)</option>
          {clientProfiles.map(c => (
            <option key={c.id} value={c.id}>{c.name}{c.email ? ` · ${c.email}` : ''}</option>
          ))}
        </select>
      )}
      {flash && <Check size={14} className="text-mint animate-fadeIn" />}
      {order.briefConfirmedAt && (
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-mint-dim text-mint shrink-0">Brief confirmado</span>
      )}
    </div>
  );
}
