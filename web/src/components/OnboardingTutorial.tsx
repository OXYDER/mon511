import { useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api';

interface Props {
  lang: 'fr' | 'en';
  onFinish: () => void;
}

/** Petite bulle de pin utilisée dans plusieurs étapes de démo — même
 * apparence que les vrais pins sur la carte, pour que le tutoriel se
 * sente familier plutôt que déconnecté de l'app réelle. */
function DemoPin({ icon, color, selected, onClick, style }: { icon: string; color: string; selected?: boolean; onClick?: () => void; style?: React.CSSProperties }) {
  return (
    <div
      onClick={onClick}
      style={{
        width: 40, height: 40, borderRadius: '50%', background: '#1B1E25',
        border: `3px solid ${color}`, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 17, cursor: onClick ? 'pointer' : 'default', flexShrink: 0,
        boxShadow: selected ? `0 0 0 3px ${color}, 0 0 0 6px ${color}55` : '0 2px 6px rgba(0,0,0,0.4)',
        transition: 'box-shadow 0.2s ease', ...style,
      }}
    >
      {icon}
    </div>
  );
}

export default function OnboardingTutorial({ lang, onFinish }: Props) {
  const [step, setStep] = useState(0);
  const [demoPinSelected, setDemoPinSelected] = useState(false);
  const [demoLayerOn, setDemoLayerOn] = useState(true);
  const [demoLocationMethod, setDemoLocationMethod] = useState<string | null>(null);
  const [demoReaction, setDemoReaction] = useState<string | null>(null);

  const fr = lang === 'fr';

  const steps: { title: string; body: React.ReactNode; requireInteraction?: boolean; done?: boolean }[] = [
    {
      title: fr ? 'Bienvenue sur mon511' : 'Welcome to mon511',
      body: (
        <>
          <p style={{ fontSize: 14, lineHeight: 1.6 }}>
            {fr
              ? "mon511 est une plateforme communautaire pour signaler et suivre les dangers routiers au Québec — nids-de-poule, arbres tombés, conditions hivernales, et bien d'autres. Chaque signalement aide les autres usagers de la route."
              : 'mon511 is a community platform for reporting and tracking road hazards across Quebec — potholes, fallen trees, winter conditions, and more. Every report helps other road users.'}
          </p>
          <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text-muted)' }}>
            {fr
              ? 'Ce court tutoriel te fait découvrir chaque section — quelques clics suffisent, et tu peux le passer en tout temps.'
              : 'This short tutorial walks you through every section — just a few clicks, and you can skip it at any time.'}
          </p>
        </>
      ),
    },
    {
      title: fr ? 'La carte et les signalements' : 'The map and reports',
      body: (
        <>
          <p style={{ fontSize: 13.5, lineHeight: 1.5, marginBottom: 14 }}>
            {fr ? 'Chaque signalement est un pin coloré sur la carte. Essaie de cliquer sur celui-ci :' : 'Every report is a colored pin on the map. Try clicking this one:'}
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', padding: '20px 0' }}>
            <DemoPin icon="🕳️" color="#FF5A1F" selected={demoPinSelected} onClick={() => setDemoPinSelected(true)} />
          </div>
          {demoPinSelected && (
            <div style={{ background: 'var(--panel-hover)', borderRadius: 10, padding: 12, fontSize: 12.5, marginTop: 8, animation: 'toast-in 0.25s ease' }}>
              {fr
                ? '👍 Voilà! Un clic ouvre toujours la fiche complète — photo, description, statut et adresse. Orange = non résolu, vert = résolu.'
                : '👍 There you go! A click always opens the full detail — photo, description, status, and address. Orange = unresolved, green = resolved.'}
            </div>
          )}
        </>
      ),
      requireInteraction: true,
      done: demoPinSelected,
    },
    {
      title: fr ? 'Les regroupements' : 'Clusters',
      body: (
        <>
          <p style={{ fontSize: 13.5, lineHeight: 1.5, marginBottom: 14 }}>
            {fr
              ? "Quand plusieurs signalements sont proches, ils se regroupent en un chiffre. Clique dessus pour t'en approcher — plus tu zoomes, plus le groupe se sépare en signalements individuels."
              : 'When several reports are close together, they group into a number. Click it to zoom in — the closer you get, the more it splits into individual reports.'}
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', padding: '16px 0' }}>
            <div style={{
              width: 40, height: 40, borderRadius: '50%', background: 'var(--accent-signal)', color: '#14161B',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 15,
            }}>
              8
            </div>
          </div>
        </>
      ),
    },
    {
      title: fr ? 'Signaler un danger' : 'Reporting a hazard',
      body: (
        <>
          <p style={{ fontSize: 13.5, lineHeight: 1.5, marginBottom: 14 }}>
            {fr
              ? "Le bouton \"Signaler\" propose 3 façons de choisir l'emplacement exact. Essaie-les :"
              : 'The "Report" button offers 3 ways to pin the exact location. Try them:'}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { key: 'gps', icon: '📍', fr: 'GPS — ta position actuelle', en: 'GPS — your current position' },
              { key: 'map', icon: '🗺️', fr: 'Cliquer sur la carte', en: 'Click on the map' },
              { key: 'search', icon: '🔎', fr: 'Rechercher une adresse', en: 'Search an address' },
            ].map((opt) => (
              <button
                key={opt.key}
                onClick={() => setDemoLocationMethod(opt.key)}
                className="btn-ghost"
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', fontSize: 13, justifyContent: 'flex-start',
                  border: demoLocationMethod === opt.key ? '1.5px solid var(--accent-signal)' : '1px solid var(--panel-border)',
                }}
              >
                <span style={{ fontSize: 16 }}>{opt.icon}</span> {fr ? opt.fr : opt.en}
                {demoLocationMethod === opt.key && <span style={{ marginLeft: 'auto' }}>✓</span>}
              </button>
            ))}
          </div>
          {demoLocationMethod && (
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 10 }}>
              {fr
                ? 'Peu importe la méthode, une bonne précision est vérifiée avant de continuer — pour que ton signalement soit vraiment utile aux autres.'
                : 'Whatever method you pick, good accuracy is checked before continuing — so your report is genuinely useful to others.'}
            </p>
          )}
        </>
      ),
      requireInteraction: true,
      done: !!demoLocationMethod,
    },
    {
      title: fr ? 'Mes signalements' : 'My reports',
      body: (
        <p style={{ fontSize: 13.5, lineHeight: 1.6 }}>
          {fr
            ? "Dans le menu, \"Mes signalements\" liste tout ce que tu as rapporté — tu peux les modifier, ajouter des photos, ou suivre les échanges avec l'équipe de modération si un signalement a besoin de précisions."
            : 'In the menu, "My reports" lists everything you\'ve reported — you can edit them, add photos, or follow up on exchanges with the moderation team if a report needs clarification.'}
        </p>
      ),
    },
    {
      title: fr ? 'Détails de la carte' : 'Map details',
      body: (
        <>
          <p style={{ fontSize: 13.5, lineHeight: 1.5, marginBottom: 14 }}>
            {fr
              ? "Ce panneau te permet d'activer ou désactiver différentes couches — travaux routiers, conditions hivernales, feux de forêt, et plus. Essaie ce bouton :"
              : 'This panel lets you toggle different layers — road work, winter conditions, forest fires, and more. Try this switch:'}
          </p>
          <div className="layer-toggle" style={{ maxWidth: 260, margin: '0 auto' }}>
            <span style={{ fontSize: 12.5 }}>🚧 {fr ? 'Travaux routiers' : 'Road work'}</span>
            <button
              onClick={() => setDemoLayerOn((v) => !v)}
              style={{
                width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer',
                background: demoLayerOn ? 'var(--accent-signal)' : 'var(--panel-border)', position: 'relative', transition: 'background 0.2s',
              }}
            >
              <span style={{
                position: 'absolute', top: 2, left: demoLayerOn ? 20 : 2, width: 18, height: 18, borderRadius: '50%',
                background: '#fff', transition: 'left 0.2s',
              }} />
            </button>
          </div>
        </>
      ),
    },
    {
      title: fr ? 'Amis' : 'Friends',
      body: (
        <>
          <p style={{ fontSize: 13.5, lineHeight: 1.6, marginBottom: 10 }}>
            {fr
              ? "Ajoute des amis par courriel pour voir leurs signalements sur la carte (icône 💜) et discuter avec eux directement."
              : 'Add friends by email to see their reports on the map (💜 icon) and chat with them directly.'}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--panel-hover)', borderRadius: 10, padding: 10, fontSize: 12 }}>
            <div style={{ position: 'relative', width: 32, height: 32, flexShrink: 0 }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--accent-signal)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#14161B', fontWeight: 700 }}>A</div>
              <span style={{ position: 'absolute', bottom: -1, right: -1, width: 9, height: 9, borderRadius: '50%', background: '#3BD16F', border: '2px solid var(--panel-solid)' }} />
            </div>
            <span>{fr ? 'Un point vert = ton ami est en ligne' : 'A green dot = your friend is online'}</span>
          </div>
        </>
      ),
    },
    {
      title: fr ? 'Messagerie' : 'Messaging',
      body: (
        <>
          <p style={{ fontSize: 13.5, lineHeight: 1.5, marginBottom: 14 }}>
            {fr ? 'Double-clique un message (ou l\'icône 😊) pour réagir. Essaie :' : 'Double-click a message (or the 😊 icon) to react. Try it:'}
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
            <div
              onDoubleClick={() => setDemoReaction((r) => (r ? null : '👍'))}
              style={{ background: 'var(--accent-signal)', color: '#14161B', padding: '9px 13px', borderRadius: 18, borderBottomRightRadius: 5, fontSize: 13, cursor: 'pointer' }}
            >
              {fr ? 'Allo! 👋' : 'Hey! 👋'}
            </div>
          </div>
          {demoReaction && (
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <span style={{ fontSize: 13, background: 'var(--panel-solid)', border: '1px solid var(--panel-border)', borderRadius: 10, padding: '2px 8px' }}>{demoReaction}</span>
            </div>
          )}
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 10 }}>
            {fr ? 'Les messages arrivent en temps réel, avec accusé de lecture (✓✓) et indicateur "en train d\'écrire".' : 'Messages arrive in real time, with read receipts (✓✓) and a "typing" indicator.'}
          </p>
        </>
      ),
      requireInteraction: true,
      done: !!demoReaction,
    },
    {
      title: fr ? 'Ton profil' : 'Your profile',
      body: (
        <p style={{ fontSize: 13.5, lineHeight: 1.6 }}>
          {fr
            ? "Dans ton profil, tu contrôles ce qui est visible aux autres (réputation, région, statut en ligne) et tu peux bloquer un usager si nécessaire. C'est aussi là que tu peux recommencer ce tutoriel n'importe quand."
            : "In your profile, you control what's visible to others (reputation, region, online status), and you can block a user if needed. It's also where you can replay this tutorial anytime."}
        </p>
      ),
    },
    {
      title: fr ? "C'est parti!" : "You're all set!",
      body: (
        <>
          <p style={{ fontSize: 14, lineHeight: 1.6 }}>
            {fr
              ? "Tu connais maintenant les bases de mon511. Merci de contribuer à des routes plus sécuritaires pour tout le monde!"
              : "You now know the basics of mon511. Thanks for helping make roads safer for everyone!"}
          </p>
          <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 10 }}>
            {fr ? 'Tu peux revoir ce tutoriel en tout temps depuis ton profil.' : 'You can revisit this tutorial anytime from your profile.'}
          </p>
        </>
      ),
    },
  ];

  const current = steps[step];
  const isLast = step === steps.length - 1;
  const canAdvance = !current.requireInteraction || current.done;

  async function finish() {
    await api.post('/users/me/tutorial/complete', {}).catch(() => {});
    onFinish();
  }

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'var(--panel-solid)', borderRadius: 18, width: 400, maxWidth: '100%', maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
        <div style={{ display: 'flex', gap: 4, padding: '16px 20px 0' }}>
          {steps.map((_, i) => (
            <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= step ? 'var(--accent-signal)' : 'var(--panel-border)' }} />
          ))}
        </div>

        <div style={{ padding: '18px 22px', overflowY: 'auto', flex: 1 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 12 }}>{current.title}</h2>
          {current.body}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 22px', borderTop: '1px solid var(--panel-border)' }}>
          <button className="btn-ghost" style={{ fontSize: 12.5, color: 'var(--text-muted)' }} onClick={finish}>
            {fr ? 'Passer le tutoriel' : 'Skip tutorial'}
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            {step > 0 && (
              <button className="btn-ghost" style={{ fontSize: 13 }} onClick={() => setStep((s) => s - 1)}>
                {fr ? '← Retour' : '← Back'}
              </button>
            )}
            <button
              className="btn-primary"
              style={{ fontSize: 13, opacity: canAdvance ? 1 : 0.5 }}
              disabled={!canAdvance}
              onClick={() => (isLast ? finish() : setStep((s) => s + 1))}
            >
              {isLast ? (fr ? 'Terminer' : 'Finish') : (fr ? 'Suivant →' : 'Next →')}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
