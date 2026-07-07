import { useState, useEffect, useRef } from 'react';
import axios from 'axios';

const API = import.meta.env.VITE_API_URL || 'http://192.168.1.24:3000/api/v1';

type VerificationStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

interface Washer {
  id: string;
  cinPhotoUrl: string | null;
  equipmentType: string | null;
  licensePlate: string | null;
  verificationStatus: VerificationStatus;
  verificationNote: string | null;
  createdAt: string;
  user: {
    id: string;
    fullName: string;
    phone: string;
    email: string | null;
  };
}

interface CarouselSlide {
  id: string;
  imageUrl: string;
  title: string;
  subtitle: string | null;
  order: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

const api = axios.create({ baseURL: API });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('admin_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ─── Login ───────────────────────────────────────────
function LoginPage({ onLogin }: { onLogin: (token: string) => void }) {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await axios.post(`${API}/auth/login`, { phone, password });
      if (res.data.user.role !== 'ADMIN') {
        setError('Accès réservé aux administrateurs');
        return;
      }
      localStorage.setItem('admin_token', res.data.accessToken);
      onLogin(res.data.accessToken);
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Identifiants invalides');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.loginPage}>
      <div style={styles.loginCard}>
        <h1 style={styles.loginTitle}> WashGo Admin</h1>
        <p style={styles.loginSubtitle}>Dashboard de validation des laveurs</p>

        {error && <div style={styles.errorBanner}>{error}</div>}

        <input
          style={styles.input}
          placeholder="Téléphone admin (+212...)"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
        />
        <input
          style={styles.input}
          type="password"
          placeholder="Mot de passe"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
        />
        <button
          style={{ ...styles.btn, ...styles.btnPrimary, opacity: loading ? 0.6 : 1 }}
          onClick={handleLogin}
          disabled={loading}
        >
          {loading ? 'Connexion...' : 'Se connecter'}
        </button>
      </div>
    </div>
  );
}

// ─── Carousel Manager ────────────────────────────────
function CarouselManager({ showToast }: { showToast: (msg: string, type?: 'success' | 'error') => void }) {
  const [slides, setSlides] = useState<CarouselSlide[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<CarouselSlide | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formSubtitle, setFormSubtitle] = useState('');
  const [formOrder, setFormOrder] = useState(0);
  const [formActive, setFormActive] = useState(true);
  const [formFile, setFormFile] = useState<File | null>(null);
  const [formPreview, setFormPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const fetchSlides = async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/carousel');
      setSlides(res.data);
    } catch {
      showToast('Erreur chargement', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSlides(); }, []);

  const openAdd = () => {
    setEditing(null);
    setFormTitle('');
    setFormSubtitle('');
    setFormOrder(slides.length);
    setFormActive(true);
    setFormFile(null);
    setFormPreview(null);
    setShowForm(true);
  };

  const openEdit = (s: CarouselSlide) => {
    setEditing(s);
    setFormTitle(s.title);
    setFormSubtitle(s.subtitle ?? '');
    setFormOrder(s.order);
    setFormActive(s.active);
    setFormFile(null);
    setFormPreview(s.imageUrl);
    setShowForm(true);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setFormFile(file);
    if (file) {
      const reader = new FileReader();
      reader.onload = () => setFormPreview(reader.result as string);
      reader.readAsDataURL(file);
    } else if (editing) {
      setFormPreview(editing.imageUrl);
    } else {
      setFormPreview(null);
    }
  };

  const handleSubmit = async () => {
    if (!formTitle.trim()) return;
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('title', formTitle);
      fd.append('subtitle', formSubtitle);
      fd.append('order', String(formOrder));
      fd.append('active', String(formActive));
      if (formFile) fd.append('image', formFile);

      if (editing) {
        await api.patch(`/admin/carousel/${editing.id}`, fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        showToast('Slide modifiée');
      } else {
        await api.post('/admin/carousel', fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        showToast('Slide ajoutée');
      }
      setShowForm(false);
      fetchSlides();
    } catch (err: any) {
      showToast(err.response?.data?.message ?? 'Erreur', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await api.delete(`/admin/carousel/${deleteId}`);
      showToast('Slide supprimée');
      setDeleteId(null);
      fetchSlides();
    } catch (err: any) {
      showToast(err.response?.data?.message ?? 'Erreur', 'error');
    }
  };

  const toggleActive = async (s: CarouselSlide) => {
    try {
      await api.patch(`/admin/carousel/${s.id}`, { active: !s.active }, {
        headers: { 'Content-Type': 'application/json' },
      });
      fetchSlides();
    } catch {
      showToast('Erreur', 'error');
    }
  };

  return (
    <div>
      <div style={{ ...styles.filters, justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontWeight: 700, fontSize: 18, color: '#333' }}>
            Carousel
          </span>
          <span style={{
            backgroundColor: '#0066FF', color: '#fff', borderRadius: 12,
            padding: '2px 10px', fontSize: 12, fontWeight: 600,
          }}>
            {slides.length}
          </span>
        </div>
        <button style={{ ...styles.btn, ...styles.btnPrimary, flex: 'none', width: 'auto', padding: '10px 24px' }} onClick={openAdd}>
          + Nouvelle slide
        </button>
      </div>

      <div style={styles.content}>
        {loading ? (
          <div style={styles.centered}>Chargement...</div>
        ) : slides.length === 0 ? (
          <div style={{ ...styles.centered, padding: 80 }}>
            <div style={{
              fontSize: 64, marginBottom: 16, opacity: 0.3,
            }}>📷</div>
            <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
              Aucune slide pour le moment
            </p>
            <p style={{ fontSize: 13, color: '#999', marginBottom: 24 }}>
              Ajoutez votre première slide pour le carousel de l'application
            </p>
            <button
              style={{ ...styles.btn, ...styles.btnPrimary, flex: 'none', width: 'auto', padding: '12px 32px' }}
              onClick={openAdd}
            >
              + Ajouter une slide
            </button>
          </div>
        ) : (
          <div style={styles.grid}>
            {slides.map((s) => (
              <div key={s.id} style={{
                ...styles.card,
                opacity: s.active ? 1 : 0.55,
                display: 'flex', flexDirection: 'column',
              }}>
                <div style={{ position: 'relative', width: '100%', aspectRatio: '16/9', overflow: 'hidden' }}>
                  <img
                    src={s.imageUrl}
                    alt={s.title}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                  <div style={{
                    position: 'absolute', bottom: 0, left: 0, right: 0,
                    background: 'linear-gradient(transparent, rgba(0,0,0,0.6))',
                    padding: '24px 16px 12px',
                  }}>
                    <div style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>
                      {s.title}
                    </div>
                    {s.subtitle && (
                      <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 2 }}>
                        {s.subtitle}
                      </div>
                    )}
                  </div>
                </div>
                <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, color: '#999' }}>Ordre {s.order}</span>
                    <button
                      onClick={() => toggleActive(s)}
                      style={{
                        padding: '4px 10px', borderRadius: 12, border: 'none',
                        fontSize: 11, fontWeight: 600, cursor: 'pointer',
                        backgroundColor: s.active ? '#E8F5E9' : '#FFEBEE',
                        color: s.active ? '#2E7D32' : '#C62828',
                      }}
                    >
                      {s.active ? 'Actif' : 'Inactif'}
                    </button>
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button
                      onClick={() => openEdit(s)}
                      style={{
                        padding: '6px 12px', borderRadius: 8, border: '1px solid #E0E0E0',
                        background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#333',
                      }}
                    >
                      Modifier
                    </button>
                    <button
                      onClick={() => setDeleteId(s.id)}
                      style={{
                        padding: '6px 12px', borderRadius: 8, border: 'none',
                        background: '#C62828', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#fff',
                      }}
                    >
                      Supprimer
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showForm && (
        <div style={styles.overlay}>
          <div style={{ ...styles.modal, maxWidth: 520 }}>
            <div style={styles.modalHeader}>
              <h2 style={styles.modalTitle}>{editing ? 'Modifier la slide' : 'Nouvelle slide'}</h2>
              <button style={styles.closeBtn} onClick={() => setShowForm(false)}>✕</button>
            </div>
            <div style={styles.modalBody}>
              <div style={{
                width: '100%', aspectRatio: '16/9', borderRadius: 10,
                overflow: 'hidden', marginBottom: 16, backgroundColor: '#F4F5F7',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {formPreview ? (
                  <img src={formPreview} alt="Aperçu" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <span style={{ color: '#ccc', fontSize: 14 }}>Aperçu de l'image</span>
                )}
              </div>

              <label style={{ fontSize: 12, fontWeight: 600, color: '#333', marginBottom: 4, display: 'block' }}>Image</label>
              <input
                type="file"
                accept="image/*"
                style={{ ...styles.input, padding: 10, fontSize: 14 }}
                onChange={handleFileChange}
              />
              {editing && !formFile && <p style={{ fontSize: 12, color: '#999', marginTop: -8, marginBottom: 12 }}>Laissez vide pour conserver l'image actuelle</p>}

              <label style={{ fontSize: 12, fontWeight: 600, color: '#333', marginBottom: 4, display: 'block' }}>Titre</label>
              <input
                style={styles.input}
                placeholder="Titre de la slide"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
              />

              <label style={{ fontSize: 12, fontWeight: 600, color: '#333', marginBottom: 4, display: 'block' }}>Sous-titre</label>
              <input
                style={styles.input}
                placeholder="Sous-titre (optionnel)"
                value={formSubtitle}
                onChange={(e) => setFormSubtitle(e.target.value)}
              />

              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#333', marginBottom: 4, display: 'block' }}>Ordre</label>
                  <input
                    type="number" min={0}
                    style={styles.input}
                    value={formOrder}
                    onChange={(e) => setFormOrder(parseInt(e.target.value, 10) || 0)}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#333', marginBottom: 4, display: 'block' }}>Actif</label>
                  <select
                    style={styles.input}
                    value={formActive ? 'true' : 'false'}
                    onChange={(e) => setFormActive(e.target.value === 'true')}
                  >
                    <option value="true">Oui</option>
                    <option value="false">Non</option>
                  </select>
                </div>
              </div>

              <div style={styles.actions}>
                <button style={{ ...styles.btn, ...styles.btnOutline }} onClick={() => setShowForm(false)}>
                  Annuler
                </button>
                <button
                  style={{ ...styles.btn, ...styles.btnPrimary, opacity: (!formTitle.trim() || submitting) ? 0.6 : 1 }}
                  onClick={handleSubmit}
                  disabled={!formTitle.trim() || submitting}
                >
                  {submitting ? 'Envoi...' : editing ? 'Enregistrer' : 'Ajouter'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {deleteId && (
        <div style={styles.overlay} onClick={() => setDeleteId(null)}>
          <div style={{ ...styles.modal, maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h2 style={styles.modalTitle}>Confirmer la suppression</h2>
              <button style={styles.closeBtn} onClick={() => setDeleteId(null)}>✕</button>
            </div>
            <div style={styles.modalBody}>
              <p style={{ color: '#666', marginBottom: 16 }}>Cette action est irréversible.</p>
              <div style={styles.actions}>
                <button style={{ ...styles.btn, ...styles.btnOutline }} onClick={() => setDeleteId(null)}>
                  Annuler
                </button>
                <button style={{ ...styles.btn, ...styles.btnDanger }} onClick={handleDelete}>
                  Confirmer la suppression
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Dashboard ───────────────────────────────────────
function Dashboard({ onLogout }: { onLogout: () => void }) {
  const [tab, setTab] = useState<'washers' | 'carousel'>('washers');
  const [washers, setWashers] = useState<Washer[]>([]);
  const [filter, setFilter] = useState<VerificationStatus | 'ALL'>('PENDING');
  const [selected, setSelected] = useState<Washer | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const washersCache = useRef<Map<string, { data: Washer[]; ts: number }>>(new Map());
  const CACHE_TTL = 30000;

  const fetchWashers = async () => {
    const cacheKey = filter;
    const cached = washersCache.current.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      setWashers(cached.data);
      return;
    }

    setLoading(true);
    try {
      const url = filter === 'ALL'
        ? '/admin/washers'
        : `/admin/washers?status=${filter}`;
      const res = await api.get(url);
      washersCache.current.set(cacheKey, { data: res.data, ts: Date.now() });
      if (washersCache.current.size > 20) {
        const now = Date.now();
        for (const [key, entry] of washersCache.current) {
          if (now - entry.ts > CACHE_TTL * 3) washersCache.current.delete(key);
        }
      }
      setWashers(res.data);
    } catch {
      showToast('Erreur chargement', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (tab === 'washers') fetchWashers(); }, [filter, tab]);

  const handleApprove = async (washer: Washer) => {
    setActionLoading(true);
    try {
      await api.post(`/admin/washers/${washer.id}/approve`);
      showToast(`${washer.user.fullName} approuvé !`);
      setSelected(null);
      fetchWashers();
    } catch (err: any) {
      showToast(err.response?.data?.message ?? 'Erreur', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!selected || !rejectReason.trim()) return;
    setActionLoading(true);
    try {
      await api.post(`/admin/washers/${selected.id}/reject`, { reason: rejectReason });
      showToast(`${selected.user.fullName} rejeté`);
      setSelected(null);
      setShowRejectModal(false);
      setRejectReason('');
      fetchWashers();
    } catch (err: any) {
      showToast(err.response?.data?.message ?? 'Erreur', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const statusBadge = (status: VerificationStatus) => {
    const map = {
      PENDING: { label: ' En attente', bg: '#FFF8E1', color: '#996A00' },
      APPROVED: { label: ' Approuvé', bg: '#E8F5E9', color: '#2E7D32' },
      REJECTED: { label: ' Rejeté', bg: '#FFEBEE', color: '#C62828' },
    };
    const s = map[status];
    return (
      <span style={{ ...styles.badge, backgroundColor: s.bg, color: s.color }}>
        {s.label}
      </span>
    );
  };

  const equipmentLabel = (type: string | null) => {
    const map: Record<string, string> = {
      TRIPORTEUR: ' Triporteur',
      MINIVAN: ' Mini Van',
      MOBILE: ' Mobile',
    };
    return type ? (map[type] ?? type) : '—';
  };

  return (
    <div style={styles.page}>
      {/* Toast */}
      {toast && (
        <div style={{
          ...styles.toast,
          backgroundColor: toast.type === 'success' ? '#2E7D32' : '#C62828',
        }}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div style={styles.header}>
        <h1 style={styles.headerTitle}> WashGo Admin</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              style={{
                ...styles.tabBtn,
                ...(tab === 'washers' ? styles.tabBtnActive : {}),
              }}
              onClick={() => setTab('washers')}
            >
              Laveurs
            </button>
            <button
              style={{
                ...styles.tabBtn,
                ...(tab === 'carousel' ? styles.tabBtnActive : {}),
              }}
              onClick={() => setTab('carousel')}
            >
              Carousel
            </button>
          </div>
          <button style={{ ...styles.btn, ...styles.btnOutline, flex: 'none', width: 'auto' }} onClick={onLogout}>
            Déconnexion
          </button>
        </div>
      </div>

      {tab === 'carousel' ? (
        <CarouselManager showToast={showToast} />
      ) : (
        <>
          {/* Filtres */}
          <div style={styles.filters}>
            {(['PENDING', 'APPROVED', 'REJECTED', 'ALL'] as const).map((f) => (
              <button
                key={f}
                style={{
                  ...styles.filterBtn,
                  ...(filter === f ? styles.filterBtnActive : {}),
                }}
                onClick={() => setFilter(f)}
              >
                {f === 'ALL' ? 'Tous' : f === 'PENDING' ? ' En attente' : f === 'APPROVED' ? ' Approuvés' : ' Rejetés'}
              </button>
            ))}
          </div>

          {/* Liste */}
          <div style={styles.content}>
            {loading ? (
              <div style={styles.centered}>Chargement...</div>
            ) : washers.length === 0 ? (
              <div style={styles.centered}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
                <p>Aucun laveur dans cette catégorie</p>
              </div>
            ) : (
              <div style={styles.grid}>
                {washers.map((w) => (
                  <div
                    key={w.id}
                    style={styles.card}
                    onClick={() => setSelected(w)}
                  >
                    {w.cinPhotoUrl ? (
                      <img src={w.cinPhotoUrl} alt="CIN" style={styles.cardImage} />
                    ) : (
                      <div style={styles.cardImagePlaceholder}>📄 Pas de photo</div>
                    )}

                    <div style={styles.cardBody}>
                      <div style={styles.cardName}>{w.user.fullName}</div>
                      <div style={styles.cardPhone}>{w.user.phone}</div>
                      <div style={styles.cardEquip}>{equipmentLabel(w.equipmentType)}</div>
                      {w.licensePlate && (
                        <div style={styles.cardPlate}>🚗 {w.licensePlate}</div>
                      )}
                      <div style={{ marginTop: 8 }}>{statusBadge(w.verificationStatus)}</div>
                      <div style={styles.cardDate}>
                        {new Date(w.createdAt).toLocaleDateString('fr-MA')}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Modal détail */}
          {selected && (
            <div style={styles.overlay} onClick={() => setSelected(null)}>
              <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
                <div style={styles.modalHeader}>
                  <h2 style={styles.modalTitle}>{selected.user.fullName}</h2>
                  <button style={styles.closeBtn} onClick={() => setSelected(null)}>✕</button>
                </div>

                <div style={styles.modalBody}>
                  <div style={styles.infoGrid}>
                    <div style={styles.infoItem}>
                      <span style={styles.infoLabel}>Téléphone</span>
                      <span style={styles.infoValue}>{selected.user.phone}</span>
                    </div>
                    <div style={styles.infoItem}>
                      <span style={styles.infoLabel}>Équipement</span>
                      <span style={styles.infoValue}>{equipmentLabel(selected.equipmentType)}</span>
                    </div>
                    {selected.licensePlate && (
                      <div style={styles.infoItem}>
                        <span style={styles.infoLabel}>Plaque</span>
                        <span style={styles.infoValue}>{selected.licensePlate}</span>
                      </div>
                    )}
                    <div style={styles.infoItem}>
                      <span style={styles.infoLabel}>Statut</span>
                      <span>{statusBadge(selected.verificationStatus)}</span>
                    </div>
                    {selected.verificationNote && (
                      <div style={styles.infoItem}>
                        <span style={styles.infoLabel}>Motif rejet</span>
                        <span style={{ color: '#C62828' }}>{selected.verificationNote}</span>
                      </div>
                    )}
                  </div>

                  <div style={styles.cinSection}>
                    <h3 style={styles.cinTitle}>📄 Photo CIN</h3>
                    {selected.cinPhotoUrl ? (
                      <img src={selected.cinPhotoUrl} alt="CIN" style={styles.cinImage} />
                    ) : (
                      <div style={styles.cinPlaceholder}>Aucune photo disponible</div>
                    )}
                  </div>

                  {selected.verificationStatus === 'PENDING' && (
                    <div style={styles.actions}>
                      <button
                        style={{ ...styles.btn, ...styles.btnSuccess, opacity: actionLoading ? 0.6 : 1 }}
                        onClick={() => handleApprove(selected)}
                        disabled={actionLoading}
                      >
                        Approuver
                      </button>
                      <button
                        style={{ ...styles.btn, ...styles.btnDanger, opacity: actionLoading ? 0.6 : 1 }}
                        onClick={() => setShowRejectModal(true)}
                        disabled={actionLoading}
                      >
                        Rejeter
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Modal rejet */}
          {showRejectModal && (
            <div style={styles.overlay}>
              <div style={{ ...styles.modal, maxWidth: 400 }}>
                <div style={styles.modalHeader}>
                  <h2 style={styles.modalTitle}>Motif de rejet</h2>
                  <button style={styles.closeBtn} onClick={() => setShowRejectModal(false)}>✕</button>
                </div>
                <div style={styles.modalBody}>
                  <p style={{ color: '#666', marginBottom: 12 }}>
                    Expliquez pourquoi la demande de <strong>{selected?.user.fullName}</strong> est rejetée.
                    Ce message sera envoyé par notification push.
                  </p>
                  <textarea
                    style={{ ...styles.input, minHeight: 100, resize: 'vertical' } as React.CSSProperties}
                    placeholder="Ex: Photo CIN illisible, informations incorrectes..."
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                  />
                  <div style={styles.actions}>
                    <button style={{ ...styles.btn, ...styles.btnOutline }} onClick={() => setShowRejectModal(false)}>
                      Annuler
                    </button>
                    <button
                      style={{
                        ...styles.btn, ...styles.btnDanger,
                        opacity: (!rejectReason.trim() || actionLoading) ? 0.6 : 1,
                      }}
                      onClick={handleReject}
                      disabled={!rejectReason.trim() || actionLoading}
                    >
                      {actionLoading ? 'Envoi...' : 'Confirmer le rejet'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── App ─────────────────────────────────────────────
export default function App() {
  const [token, setToken] = useState<string | null>(
    localStorage.getItem('admin_token'),
  );

  const handleLogin = (t: string) => setToken(t);

  const handleLogout = () => {
    localStorage.removeItem('admin_token');
    setToken(null);
  };

  if (!token) return <LoginPage onLogin={handleLogin} />;
  return <Dashboard onLogout={handleLogout} />;
}

// ─── Styles ──────────────────────────────────────────
const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', backgroundColor: '#F4F5F7', fontFamily: 'system-ui, sans-serif' },
  header: {
    backgroundColor: '#fff', padding: '16px 24px',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    borderBottom: '1px solid #EEE', position: 'sticky', top: 0, zIndex: 10,
  },
  headerTitle: { margin: 0, fontSize: 20, fontWeight: 700, color: '#0066FF' },
  tabBtn: {
    padding: '8px 16px', borderRadius: 8, border: 'none',
    cursor: 'pointer', fontWeight: 600, fontSize: 14,
    backgroundColor: 'transparent', color: '#666',
  },
  tabBtnActive: { backgroundColor: '#0066FF', color: '#fff' },
  filters: { padding: '16px 24px', display: 'flex', gap: 8, flexWrap: 'wrap' },
  filterBtn: {
    padding: '8px 16px', borderRadius: 20, border: '2px solid #E0E0E0',
    background: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 14,
  },
  filterBtnActive: { borderColor: '#0066FF', backgroundColor: '#E8F1FF', color: '#0066FF' },
  content: { padding: '0 24px 24px' },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: 16,
  },
  card: {
    backgroundColor: '#fff', borderRadius: 14, overflow: 'hidden',
    border: '1px solid #EEE', cursor: 'pointer',
    transition: 'box-shadow 0.2s',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  },
  cardImage: { width: '100%', height: 140, objectFit: 'cover' },
  cardImagePlaceholder: {
    width: '100%', height: 140, backgroundColor: '#F4F5F7',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: '#999', fontSize: 14,
  },
  cardBody: { padding: 16 },
  cardName: { fontSize: 16, fontWeight: 700, marginBottom: 4 },
  cardPhone: { fontSize: 13, color: '#666', marginBottom: 4 },
  cardEquip: { fontSize: 13, color: '#333', marginBottom: 4 },
  cardPlate: { fontSize: 13, color: '#666' },
  cardDate: { fontSize: 11, color: '#999', marginTop: 8 },
  badge: {
    display: 'inline-block', padding: '4px 10px',
    borderRadius: 12, fontSize: 12, fontWeight: 600,
  },
  centered: {
    textAlign: 'center', padding: 60, color: '#666',
  },
  overlay: {
    position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 100, padding: 16,
  },
  modal: {
    backgroundColor: '#fff', borderRadius: 16, width: '100%',
    maxWidth: 600, maxHeight: '90vh', overflow: 'auto',
  },
  modalHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '16px 20px', borderBottom: '1px solid #EEE', position: 'sticky', top: 0,
    backgroundColor: '#fff',
  },
  modalTitle: { margin: 0, fontSize: 18, fontWeight: 700 },
  closeBtn: {
    background: 'none', border: 'none', fontSize: 20,
    cursor: 'pointer', color: '#666', padding: 4,
  },
  modalBody: { padding: 20 },
  infoGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 },
  infoItem: { display: 'flex', flexDirection: 'column', gap: 4 },
  infoLabel: { fontSize: 11, color: '#999', textTransform: 'uppercase', letterSpacing: 0.5 },
  infoValue: { fontSize: 15, fontWeight: 600 },
  cinSection: { marginBottom: 20 },
  cinTitle: { fontSize: 15, fontWeight: 700, marginBottom: 10 },
  cinImage: { width: '100%', borderRadius: 10, border: '1px solid #EEE' },
  cinPlaceholder: {
    height: 120, backgroundColor: '#F4F5F7', borderRadius: 10,
    display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999',
  },
  actions: { display: 'flex', gap: 10, marginTop: 16 },
  btn: {
    padding: '12px 20px', borderRadius: 10, border: 'none',
    cursor: 'pointer', fontWeight: 600, fontSize: 14, flex: 1,
  },
  btnPrimary: { backgroundColor: '#0066FF', color: '#fff' },
  btnSuccess: { backgroundColor: '#2E7D32', color: '#fff' },
  btnDanger: { backgroundColor: '#C62828', color: '#fff' },
  btnOutline: { backgroundColor: '#fff', border: '2px solid #E0E0E0', color: '#333' },
  loginPage: {
    minHeight: '100vh', backgroundColor: '#F4F5F7',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  loginCard: {
    backgroundColor: '#fff', padding: 40, borderRadius: 16,
    width: '100%', maxWidth: 400, boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
  },
  loginTitle: { textAlign: 'center', color: '#0066FF', fontSize: 28, fontWeight: 800, margin: '0 0 8px' },
  loginSubtitle: { textAlign: 'center', color: '#666', marginBottom: 32, fontSize: 14 },
  input: {
    width: '100%', padding: '14px 16px', borderRadius: 10,
    border: '1px solid #E0E0E0', fontSize: 15, marginBottom: 12,
    boxSizing: 'border-box', outline: 'none',
  },
  errorBanner: {
    backgroundColor: '#FFEBEE', color: '#C62828', padding: '10px 14px',
    borderRadius: 8, marginBottom: 16, fontSize: 14,
  },
  toast: {
    position: 'fixed', top: 20, right: 20, color: '#fff',
    padding: '12px 20px', borderRadius: 10, fontWeight: 600,
    zIndex: 999, boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
  },
};
