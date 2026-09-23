import { useStore } from '../store';
import { Settings, DollarSign, Target, Save } from 'lucide-react';
import { useState } from 'react';

export function ConfigView() {
  const { config } = useStore();
  const [tiers, setTiers] = useState(config.tiers);
  const [clipperDaily, setClipperDaily] = useState(config.goals.clipper.daily);
  const [clipperMonthly, setClipperMonthly] = useState(config.goals.clipper.monthly);
  const [editorDaily, setEditorDaily] = useState(config.goals.editor.daily);
  const [editorMonthly, setEditorMonthly] = useState(config.goals.editor.monthly);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5">
      <div className="bg-surface-2 border border-line rounded-xl p-5">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-lg bg-accent-dim flex items-center justify-center">
            <Settings size={20} className="text-accent" />
          </div>
          <h2 className="font-display text-lg font-semibold">Configuración del sistema</h2>
        </div>
        <p className="text-sm text-muted ml-13">Define los tiers de pago y las metas del equipo</p>
      </div>

      <div className="bg-surface-2 border border-line rounded-xl p-5">
        <h3 className="font-display text-base font-semibold mb-4 flex items-center gap-2">
          <DollarSign size={18} className="text-mint" /> Tiers de pago
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted text-xs border-b border-line">
                <th className="py-2 pr-4 font-medium">Tier</th>
                <th className="py-2 pr-4 font-medium">Puntos</th>
                <th className="py-2 pr-4 font-medium">Pago Clipper ($)</th>
                <th className="py-2 pr-4 font-medium">Pago Editor ($)</th>
              </tr>
            </thead>
            <tbody>
              {tiers.map((t, i) => (
                <tr key={t.key} className="border-b border-line/50">
                  <td className="py-3 pr-4 font-medium">{t.label}</td>
                  <td className="py-3 pr-4">
                    <input type="number" value={t.points} onChange={e => setTiers(prev => prev.map((p, j) => j === i ? { ...p, points: parseInt(e.target.value) || 0 } : p))} className="w-16 bg-surface-3 border border-line rounded-md px-2 py-1 text-sm outline-none focus:border-accent" />
                  </td>
                  <td className="py-3 pr-4">
                    <input type="number" value={t.clipperPay} onChange={e => setTiers(prev => prev.map((p, j) => j === i ? { ...p, clipperPay: parseInt(e.target.value) || 0 } : p))} className="w-20 bg-surface-3 border border-line rounded-md px-2 py-1 text-sm outline-none focus:border-accent" />
                  </td>
                  <td className="py-3 pr-4">
                    <input type="number" value={t.editorPay} onChange={e => setTiers(prev => prev.map((p, j) => j === i ? { ...p, editorPay: parseInt(e.target.value) || 0 } : p))} className="w-20 bg-surface-3 border border-line rounded-md px-2 py-1 text-sm outline-none focus:border-accent" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-surface-2 border border-line rounded-xl p-5">
          <h3 className="font-display text-base font-semibold mb-4 flex items-center gap-2">
            <Target size={18} className="text-accent" /> Metas Clipper
          </h3>
          <div className="space-y-3">
            <div>
              <label className="text-sm text-muted block mb-1">Diaria (puntos)</label>
              <input type="number" value={clipperDaily} onChange={e => setClipperDaily(parseInt(e.target.value) || 0)} className="w-full bg-surface-3 border border-line rounded-md px-3 py-2 text-sm outline-none focus:border-accent" />
            </div>
            <div>
              <label className="text-sm text-muted block mb-1">Mensual (puntos)</label>
              <input type="number" value={clipperMonthly} onChange={e => setClipperMonthly(parseInt(e.target.value) || 0)} className="w-full bg-surface-3 border border-line rounded-md px-3 py-2 text-sm outline-none focus:border-accent" />
            </div>
          </div>
        </div>
        <div className="bg-surface-2 border border-line rounded-xl p-5">
          <h3 className="font-display text-base font-semibold mb-4 flex items-center gap-2">
            <Target size={18} className="text-mint" /> Metas Editor
          </h3>
          <div className="space-y-3">
            <div>
              <label className="text-sm text-muted block mb-1">Diaria (puntos)</label>
              <input type="number" value={editorDaily} onChange={e => setEditorDaily(parseInt(e.target.value) || 0)} className="w-full bg-surface-3 border border-line rounded-md px-3 py-2 text-sm outline-none focus:border-accent" />
            </div>
            <div>
              <label className="text-sm text-muted block mb-1">Mensual (puntos)</label>
              <input type="number" value={editorMonthly} onChange={e => setEditorMonthly(parseInt(e.target.value) || 0)} className="w-full bg-surface-3 border border-line rounded-md px-3 py-2 text-sm outline-none focus:border-accent" />
            </div>
          </div>
        </div>
      </div>

      <button className="w-full bg-accent text-on-accent rounded-xl py-3 font-medium hover:bg-accent-strong transition-colors flex items-center justify-center gap-2">
        <Save size={18} /> Guardar configuración
      </button>
    </div>
  );
}
