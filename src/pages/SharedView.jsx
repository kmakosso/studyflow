import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Brain, Download, CheckCircle, AlertCircle } from 'lucide-react';
import { getSharedContent } from '../services/shareService';
import { isSupabaseConfigured } from '../services/supabase';
import { db } from '../services/db';

export default function SharedView() {
  const { id } = useParams();
  const [status, setStatus]     = useState('loading'); // loading | loaded | notFound | noSupabase
  const [content, setContent]   = useState(null);
  const [imported, setImported] = useState(false);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured) { setStatus('noSupabase'); return; }
    getSharedContent(id).then(data => {
      if (!data) { setStatus('notFound'); return; }
      setContent(data);
      setStatus('loaded');
    });
  }, [id]);

  const handleImport = async () => {
    const cards = content?.content?.cards ?? [];
    if (cards.length === 0) return;
    setImporting(true);
    const today = new Date().toISOString().split('T')[0];
    for (const card of cards) {
      await db.put('revisions', {
        id:         crypto.randomUUID(),
        front:      card.front,
        back:       card.back,
        subjectId:  null,
        status:     'unseen',
        interval:   0,
        ease:       2.5,
        nextReview: today,
        lastReview: null,
        createdAt:  new Date().toISOString(),
      });
    }
    setImporting(false);
    setImported(true);
  };

  /* ── Loading ────────────────────────────────────────────────────── */
  if (status === 'loading') return (
    <div style={centeredPage}>
      <p style={{ color: 'var(--muted)', fontSize: 14 }}>Chargement…</p>
    </div>
  );

  /* ── Error states ───────────────────────────────────────────────── */
  if (status === 'notFound' || status === 'noSupabase') return (
    <div style={{ ...centeredPage, flexDirection: 'column', gap: 14 }}>
      <AlertCircle size={36} color="var(--muted)" />
      <p style={{ fontWeight: 700, fontSize: 16 }}>
        {status === 'notFound' ? 'Lien introuvable ou expiré' : 'App non configurée'}
      </p>
      <p style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', maxWidth: 340 }}>
        {status === 'notFound'
          ? 'Ce contenu n\'existe plus ou le lien est invalide.'
          : 'Cette instance de StudyFlow n\'est pas connectée à Supabase.'}
      </p>
      <Link to="/"><button className="btn-primary">Ouvrir StudyFlow</button></Link>
    </div>
  );

  /* ── Content loaded ─────────────────────────────────────────────── */
  const cards       = content.content?.cards ?? [];
  const previewCards = cards.slice(0, 3);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--background)', padding: '40px 20px' }}>
      <div style={{ maxWidth: 600, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Branding */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 42, height: 42, borderRadius: 10,
            backgroundColor: 'var(--primary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Brain size={22} color="white" />
          </div>
          <div>
            <p style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              StudyFlow · Fiches partagées
            </p>
            <h1 style={{ fontWeight: 800, fontSize: 20, lineHeight: 1.2 }}>{content.title}</h1>
          </div>
        </div>

        {/* Meta */}
        <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: -8 }}>
          {content.author_name
            ? <>Partagé par <strong>{content.author_name}</strong> · </>
            : null}
          {cards.length} fiche{cards.length > 1 ? 's' : ''} de révision
        </p>

        {/* Preview */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {previewCards.map((card, i) => (
            <div key={i} style={{
              padding: '14px 18px', backgroundColor: 'var(--card)',
              borderRadius: 12, border: '1px solid var(--border)',
            }}>
              <p style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>{card.front}</p>
              <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>{card.back}</p>
            </div>
          ))}
          {cards.length > 3 && (
            <p style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center' }}>
              + {cards.length - 3} autre{cards.length - 3 > 1 ? 's' : ''} fiche{cards.length - 3 > 1 ? 's' : ''}
            </p>
          )}
        </div>

        {/* Import CTA */}
        {imported ? (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '16px 20px', borderRadius: 12,
            backgroundColor: 'var(--success)18', border: '1px solid var(--success)44',
          }}>
            <CheckCircle size={20} color="var(--success)" />
            <div>
              <p style={{ fontWeight: 700, fontSize: 14, color: 'var(--success)' }}>Importé avec succès !</p>
              <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>
                {cards.length} fiche{cards.length > 1 ? 's' : ''} ajoutée{cards.length > 1 ? 's' : ''} à tes révisions.
              </p>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button
              className="btn-primary"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
              onClick={handleImport}
              disabled={importing}
            >
              <Download size={15} />
              {importing ? 'Importation…' : `Importer les ${cards.length} fiches dans StudyFlow`}
            </button>
            <Link to="/" style={{ textAlign: 'center', fontSize: 13, color: 'var(--muted)', textDecoration: 'none' }}>
              Ouvrir StudyFlow →
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

const centeredPage = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};
