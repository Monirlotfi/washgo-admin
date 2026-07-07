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
  textPosition: string;
  imageFit: string;
  order: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

const TEXT_POSITIONS = [
  { value: '0.5,1.0', label: 'Bas', icon: '⬇' },
  { value: '0.5,0.0', label: 'Haut', icon: '⬆' },
  { value: '0.5,0.5', label: 'Centre', icon: '⏺' },
  { value: '0.0,0.5', label: 'Gauche', icon: '⬅' },
  { value: '1.0,0.5', label: 'Droite', icon: '➡' },
  // backward compat
  { value: 'BOTTOM', label: 'Bas', icon: '⬇' },
  { value: 'TOP', label: 'Haut', icon: '⬆' },
  { value: 'CENTER', label: 'Centre', icon: '⏺' },
  { value: 'LEFT', label: 'Gauche', icon: '⬅' },
  { value: 'RIGHT', label: 'Droite', icon: '➡' },
];

const IMAGE_FITS = [
  { value: 'COVER', label: 'Remplir' },
  { value: 'CONTAIN', label: 'Adapter' },
  { value: 'CENTER', label: 'Centrer' },
];

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
const POSITION_ZONES = ['0.5,0.0', '0.0,0.5', '0.5,0.5', '1.0,0.5', '0.5,1.0'] as const;

function CarouselManager({ showToast }: { showToast: (msg: string, type?: 'success' | 'error') => void }) {
  const [slides, setSlides] = useState<CarouselSlide[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<CarouselSlide | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formSubtitle, setFormSubtitle] = useState('');
  const [formTextPosition, setFormTextPosition] = useState('0.5,1.0');
  const [formImageFit, setFormImageFit] = useState('COVER');
  const [formOrder, setFormOrder] = useState(0);
  const [formActive, setFormActive] = useState(true);
  const [formFile, setFormFile] = useState<File | null>(null);
  const [formPreview, setFormPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Crop state
  const [cropMode, setCropMode] = useState(false);
  const [cropImgUrl, setCropImgUrl] = useState<string | null>(null);
  const [cropRect, setCropRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [dragHandle, setDragHandle] = useState<string | null>(null);
  const dragStartRef = useRef<{ mx: number; my: number; rect: { x: number; y: number; w: number; h: number } } | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const textDragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  // Hover zone for click-to-position
  const [hoverZone, setHoverZone] = useState<string | null>(null);

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

  const getZoneFromClick = (clientX: number, clientY: number) => {
    const el = previewRef.current;
    if (!el || !formPreview) return null;
    const rect = el.getBoundingClientRect();
    const x = Math.round(((clientX - rect.left) / rect.width) * 100) / 100;
    const y = Math.round(((clientY - rect.top) / rect.height) * 100) / 100;
    const cx = Math.max(0, Math.min(1, x));
    const cy = Math.max(0, Math.min(1, y));
    return `${cx},${cy}`;
  };

  const handlePreviewClick = (e: React.MouseEvent) => {
    if (cropMode) return;
    const zone = getZoneFromClick(e.clientX, e.clientY);
    if (zone) setFormTextPosition(zone);
  };

  const handlePreviewLeave = () => { setHoverZone(null); textDragRef.current = null; };

  const parseTextPos = (pos: string) => {
    const m = pos?.match(/^([\d.]+),([\d.]+)$/);
    return m ? { x: parseFloat(m[1]), y: parseFloat(m[2]) } : null;
  };

  const handleTextMouseDown = (e: React.MouseEvent) => {
    if (cropMode) return;
    e.stopPropagation();
    e.preventDefault();
    const p = parseTextPos(formTextPosition) || { x: 0.5, y: 1.0 };
    textDragRef.current = { startX: e.clientX, startY: e.clientY, origX: p.x, origY: p.y };
  };

  const handlePreviewMouseMove = (e: React.MouseEvent) => {
    if (cropMode) {
      if (!dragHandle || !dragStartRef.current || !cropRect || (e.buttons & 1) === 0) return;
      const dx = e.clientX - dragStartRef.current.mx;
      const dy = e.clientY - dragStartRef.current.my;
      const sr = dragStartRef.current.rect;
      let { x, y, w, h } = sr;
      switch (dragHandle) {
        case 'nw': x = sr.x + dx; y = sr.y + dy; w = sr.w - dx; h = sr.h - dy; break;
        case 'n': y = sr.y + dy; h = sr.h - dy; break;
        case 'ne': y = sr.y + dy; w = sr.w + dx; h = sr.h - dy; break;
        case 'e': w = sr.w + dx; break;
        case 'se': w = sr.w + dx; h = sr.h + dy; break;
        case 's': h = sr.h + dy; break;
        case 'sw': x = sr.x + dx; w = sr.w - dx; h = sr.h + dy; break;
        case 'w': x = sr.x + dx; w = sr.w - dx; break;
      }
      const bounds = getDisplayBounds();
      if (bounds) {
        const min = 20;
        x = Math.max(bounds.offsetX, Math.min(x, bounds.offsetX + bounds.displayW - min));
        y = Math.max(bounds.offsetY, Math.min(y, bounds.offsetY + bounds.displayH - min));
        w = Math.max(min, Math.min(w, bounds.offsetX + bounds.displayW - x));
        h = Math.max(min, Math.min(h, bounds.offsetY + bounds.displayH - y));
      }
      setCropRect({ x, y, w, h });
      return;
    }
    if (textDragRef.current) {
      if ((e.buttons & 1) === 0) { textDragRef.current = null; return; }
      const el = previewRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const dx = (e.clientX - textDragRef.current.startX) / rect.width;
      const dy = (e.clientY - textDragRef.current.startY) / rect.height;
      const nx = Math.max(0, Math.min(1, Math.round((textDragRef.current.origX + dx) * 100) / 100));
      const ny = Math.max(0, Math.min(1, Math.round((textDragRef.current.origY + dy) * 100) / 100));
      setFormTextPosition(`${nx},${ny}`);
      return;
    }
    setHoverZone(getZoneFromClick(e.clientX, e.clientY));
  };

  const handlePreviewMouseUp = () => {
    setDragHandle(null);
    dragStartRef.current = null;
    textDragRef.current = null;
  };

  const openAdd = () => {
    setEditing(null);
    setFormTitle('');
    setFormSubtitle('');
    setFormTextPosition('0.5,1.0');
    setFormImageFit('COVER');
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
    setFormTextPosition(s.textPosition || '0.5,1.0');
    setFormImageFit(s.imageFit || 'COVER');
    setFormOrder(s.order);
    setFormActive(s.active);
    setFormFile(null);
    setFormPreview(s.imageUrl);
    setShowForm(true);
  };

  const getDisplayBounds = () => {
    const el = previewRef.current;
    if (!el) return null;
    const crect = el.getBoundingClientRect();
    const img = el.querySelector('img');
    if (!img) return null;
    const cw = crect.width, ch = crect.height;
    const iw = img.naturalWidth, ih = img.naturalHeight;
    const ca = cw / ch, ia = iw / ih;
    let dw: number, dh: number, ox: number, oy: number;
    if (ia > ca) { dw = cw; dh = cw / ia; ox = 0; oy = (ch - dh) / 2; }
    else { dh = ch; dw = ch * ia; ox = (cw - dw) / 2; oy = 0; }
    return { offsetX: ox, offsetY: oy, displayW: dw, displayH: dh, containerW: cw, containerH: ch };
  };

  const initCropRect = (url: string) => {
    const img = new Image();
    img.onload = () => {
      const el = previewRef.current;
      if (!el) return;
      const crect = el.getBoundingClientRect();
      const cw = crect.width, ch = crect.height;
      const iw = img.naturalWidth, ih = img.naturalHeight;
      const ca = cw / ch, ia = iw / ih;
      let dw: number, dh: number, ox: number, oy: number;
      if (ia > ca) { dw = cw; dh = cw / ia; ox = 0; oy = (ch - dh) / 2; }
      else { dh = ch; dw = ch * ia; ox = (cw - dw) / 2; oy = 0; }
      setCropRect({ x: ox + dw * 0.05, y: oy + dh * 0.05, w: dw * 0.9, h: dh * 0.9 });
    };
    img.src = url;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    if (!file) return;
    setFormFile(file);
    const reader = new FileReader();
    reader.onload = () => {
      const url = reader.result as string;
      setCropImgUrl(url);
      setCropMode(true);
      setCropRect(null);
      initCropRect(url);
    };
    reader.readAsDataURL(file);
  };

  // Crop mouse handlers
  const handleHandleMouseDown = (handle: string, e: React.MouseEvent) => {
    if (!cropMode || !cropRect) return;
    e.stopPropagation();
    e.preventDefault();
    dragStartRef.current = { mx: e.clientX, my: e.clientY, rect: { ...cropRect } };
    setDragHandle(handle);
  };

  const applyCrop = () => {
    if (!cropRect || !cropImgUrl) return;
    const el = previewRef.current;
    if (!el) return;
    const img = el.querySelector('img') as HTMLImageElement;
    if (!img) return;
    const bounds = getDisplayBounds();
    if (!bounds) return;
    const { x, y, w, h } = cropRect;
    if (w < 10 || h < 10) return;

    const scaleX = img.naturalWidth / bounds.displayW;
    const scaleY = img.naturalHeight / bounds.displayH;
    const sx = (x - bounds.offsetX) * scaleX;
    const sy = (y - bounds.offsetY) * scaleY;
    const sw = w * scaleX;
    const sh = h * scaleY;

    const canvas = document.createElement('canvas');
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const croppedFile = new File([blob], formFile?.name || 'cropped.png', { type: 'image/png' });
      setFormFile(croppedFile);
      setFormPreview(canvas.toDataURL());
      setCropMode(false);
      setCropRect(null);
      setCropImgUrl(null);
    }, 'image/png');
  };

  const cancelCrop = () => {
    setCropMode(false);
    setCropRect(null);
    setCropImgUrl(null);
    setFormFile(null);
    setFormPreview(editing?.imageUrl ?? null);
  };

  const handleSubmit = async () => {
    if (!formTitle.trim()) return;
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('title', formTitle);
      fd.append('subtitle', formSubtitle);
      fd.append('textPosition', formTextPosition);
      fd.append('imageFit', formImageFit);
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

  const zoneLabel = (z: string) => {
    const found = TEXT_POSITIONS.find(p => p.value === z);
    if (found) return found.label;
    const m = z?.match(/^([\d.]+),([\d.]+)$/);
    return m ? `${Math.round(parseFloat(m[1]) * 100)}%,${Math.round(parseFloat(m[2]) * 100)}%` : z;
  };
  const zoneIcon = (z: string) => TEXT_POSITIONS.find(p => p.value === z)?.icon || '';

  return (
    <div>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '20px 24px 0',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontWeight: 700, fontSize: 20, color: '#111' }}>
            Carousel
          </span>
          <span style={{
            backgroundColor: '#0066FF', color: '#fff', borderRadius: 10,
            padding: '2px 10px', fontSize: 13, fontWeight: 700,
          }}>
            {slides.length}
          </span>
        </div>
        <button
          onClick={openAdd}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '10px 20px', borderRadius: 10, border: 'none',
            backgroundColor: '#0066FF', color: '#fff',
            fontWeight: 600, fontSize: 14, cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(0,102,255,0.25)',
          }}
        >
          <span style={{ fontSize: 18, lineHeight: 1 }}>+</span>
          Nouvelle slide
        </button>
      </div>

      <div style={{ padding: '16px 24px 24px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#999' }}>Chargement...</div>
        ) : slides.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 20px' }}>
            <div style={{ fontSize: 72, marginBottom: 16, opacity: 0.2 }}>📷</div>
            <p style={{ fontSize: 17, fontWeight: 600, color: '#333', marginBottom: 6 }}>
              Aucune slide pour le moment
            </p>
            <p style={{ fontSize: 14, color: '#999', marginBottom: 24 }}>
              Créez votre première slide pour le carousel de l'application mobile
            </p>
            <button
              onClick={openAdd}
              style={{
                padding: '12px 32px', borderRadius: 10, border: 'none',
                backgroundColor: '#0066FF', color: '#fff',
                fontWeight: 600, fontSize: 14, cursor: 'pointer',
              }}
            >
              + Créer une slide
            </button>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: 20,
          }}>
            {slides.map((s) => (
              <div
                key={s.id}
                style={{
                  backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden',
                  border: '1px solid #EEE',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                  opacity: s.active ? 1 : 0.6,
                  transition: 'opacity 0.2s',
                }}
              >
                <div style={{ position: 'relative', width: '100%', aspectRatio: '16/9', overflow: 'hidden' }}>
                  <img
                    src={s.imageUrl}
                    alt={s.title}
                    style={{
                      width: '100%', height: '100%', display: 'block',
                      objectFit: s.imageFit === 'CONTAIN' ? 'contain' : s.imageFit === 'CENTER' ? 'none' : 'cover',
                      background: '#e0e0e0',
                    }}
                  />
                  <div style={{
                    position: 'absolute', inset: 0,
                    background: 'linear-gradient(transparent 40%, rgba(0,0,0,0.7))',
                  }} />
                  <div style={{
                    position: 'absolute',
                    ...getTextPositionStyle(s.textPosition || 'BOTTOM'),
                    padding: '24px 18px 16px',
                  }}>
                    <div style={{ color: '#fff', fontWeight: 700, fontSize: 18, textShadow: '0 1px 3px rgba(0,0,0,0.3)' }}>
                      {s.title}
                    </div>
                    {s.subtitle && (
                      <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, marginTop: 4, textShadow: '0 1px 2px rgba(0,0,0,0.2)' }}>
                        {s.subtitle}
                      </div>
                    )}
                  </div>
                  <div style={{
                    position: 'absolute', top: 10, left: 10,
                    backgroundColor: 'rgba(0,0,0,0.5)', color: '#fff',
                    borderRadius: 8, padding: '4px 10px',
                    fontSize: 11, fontWeight: 700, backdropFilter: 'blur(4px)',
                  }}>
                    #{s.order}
                  </div>
                  <div style={{
                    position: 'absolute', top: 10, right: 10,
                    backgroundColor: 'rgba(0,0,0,0.5)', color: '#fff',
                    borderRadius: 8, padding: '4px 8px',
                    fontSize: 10, fontWeight: 600, backdropFilter: 'blur(4px)',
                  }}>
                    {s.imageFit || 'COVER'}
                  </div>
                </div>

                <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      padding: '4px 10px', borderRadius: 20,
                      backgroundColor: s.active ? '#E8F5E9' : '#FFF3E0',
                      cursor: 'pointer',
                    }} onClick={() => toggleActive(s)}>
                      <div style={{
                        width: 8, height: 8, borderRadius: 4,
                        backgroundColor: s.active ? '#2E7D32' : '#E65100',
                      }} />
                      <span style={{
                        fontSize: 11, fontWeight: 700,
                        color: s.active ? '#2E7D32' : '#E65100',
                      }}>
                        {s.active ? 'Actif' : 'Inactif'}
                      </span>
                    </div>
                    <span style={{ fontSize: 11, color: '#aaa' }}>
                      {zoneIcon(s.textPosition || '0.5,1.0')} {zoneLabel(s.textPosition || '0.5,1.0')}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      onClick={() => openEdit(s)}
                      style={{
                        padding: '7px 14px', borderRadius: 8, border: '1px solid #E0E0E0',
                        background: '#fff', cursor: 'pointer',
                        fontSize: 12, fontWeight: 600, color: '#333',
                      }}
                    >
                      Modifier
                    </button>
                    <button
                      onClick={() => setDeleteId(s.id)}
                      style={{
                        padding: '7px 14px', borderRadius: 8, border: 'none',
                        background: '#C62828', cursor: 'pointer',
                        fontSize: 12, fontWeight: 600, color: '#fff',
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
          <div style={{ ...styles.modal, maxWidth: 640 }}>
            <div style={styles.modalHeader}>
              <h2 style={styles.modalTitle}>
                {cropMode ? 'Recadrer l\'image' : (editing ? 'Modifier la slide' : 'Nouvelle slide')}
              </h2>
              <button style={styles.closeBtn} onClick={() => {
                if (cropMode) cancelCrop();
                else setShowForm(false);
              }}>✕</button>
            </div>
            <div style={{ padding: 24 }}>
              {/* ─── crop mode ─── */}
              {cropMode && cropImgUrl ? (
                <div>
                  <p style={{ fontSize: 13, color: '#666', marginBottom: 12 }}>
                    Ajustez le cadre de recadrage en faisant glisser les poignées
                  </p>
                  <div
                    ref={previewRef}
                    style={{
                      width: '100%', aspectRatio: '16/9', borderRadius: 12,
                      overflow: 'hidden', position: 'relative',
                      backgroundColor: '#000', userSelect: 'none',
                      border: '1px solid #E0E0E0',
                    }}
                    onMouseMove={handlePreviewMouseMove}
                    onMouseUp={handlePreviewMouseUp}
                  >
                    <img src={cropImgUrl} alt="Recadrer" style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', pointerEvents: 'none' }} />
                    {cropRect && (
                      <>
                        {/* dark overlay outside crop rect */}
                        <div style={{ position: 'absolute', left: 0, top: 0, right: 0, height: cropRect.y, backgroundColor: 'rgba(0,0,0,0.45)', pointerEvents: 'none' }} />
                        <div style={{ position: 'absolute', left: 0, top: cropRect.y + cropRect.h, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)', pointerEvents: 'none' }} />
                        <div style={{ position: 'absolute', left: 0, top: cropRect.y, width: cropRect.x, height: cropRect.h, backgroundColor: 'rgba(0,0,0,0.45)', pointerEvents: 'none' }} />
                        <div style={{ position: 'absolute', left: cropRect.x + cropRect.w, top: cropRect.y, right: 0, height: cropRect.h, backgroundColor: 'rgba(0,0,0,0.45)', pointerEvents: 'none' }} />
                        {/* crop border */}
                        <div style={{
                          position: 'absolute',
                          left: cropRect.x, top: cropRect.y,
                          width: cropRect.w, height: cropRect.h,
                          border: '2px solid #fff',
                          pointerEvents: 'none',
                        }} />
                        {/* handles */}
                        {[
                          { id: 'nw', x: cropRect.x - 6, y: cropRect.y - 6, cur: 'nwse-resize' },
                          { id: 'n', x: cropRect.x + cropRect.w / 2 - 6, y: cropRect.y - 6, cur: 'ns-resize' },
                          { id: 'ne', x: cropRect.x + cropRect.w - 6, y: cropRect.y - 6, cur: 'nesw-resize' },
                          { id: 'e', x: cropRect.x + cropRect.w - 6, y: cropRect.y + cropRect.h / 2 - 6, cur: 'ew-resize' },
                          { id: 'se', x: cropRect.x + cropRect.w - 6, y: cropRect.y + cropRect.h - 6, cur: 'nwse-resize' },
                          { id: 's', x: cropRect.x + cropRect.w / 2 - 6, y: cropRect.y + cropRect.h - 6, cur: 'ns-resize' },
                          { id: 'sw', x: cropRect.x - 6, y: cropRect.y + cropRect.h - 6, cur: 'nesw-resize' },
                          { id: 'w', x: cropRect.x - 6, y: cropRect.y + cropRect.h / 2 - 6, cur: 'ew-resize' },
                        ].map((h) => (
                          <div
                            key={h.id}
                            onMouseDown={(e) => handleHandleMouseDown(h.id, e)}
                            style={{
                              position: 'absolute',
                              left: h.x, top: h.y,
                              width: 12, height: 12,
                              backgroundColor: '#fff',
                              border: '2px solid #0066FF',
                              borderRadius: 2,
                              cursor: h.cur,
                              zIndex: 10,
                              boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                            }}
                          />
                        ))}
                      </>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                    <button
                      style={{
                        flex: 1, padding: '12px 20px', borderRadius: 10,
                        border: '2px solid #E0E0E0', background: '#fff',
                        cursor: 'pointer', fontWeight: 600, fontSize: 14, color: '#333',
                      }}
                      onClick={cancelCrop}
                    >
                      Annuler
                    </button>
                    <button
                      style={{
                        flex: 1, padding: '12px 20px', borderRadius: 10, border: 'none',
                        background: '#0066FF', color: '#fff',
                        fontWeight: 600, fontSize: 14, cursor: 'pointer',
                        opacity: !cropRect ? 0.5 : 1,
                      }}
                      onClick={applyCrop}
                      disabled={!cropRect}
                    >
                      Appliquer le recadrage
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {/* ─── mobile preview with click-to-position ─── */}
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <label style={{ fontSize: 12, fontWeight: 700, color: '#444' }}>
                        Aperçu
                      </label>
                      <span style={{
                        fontSize: 11, color: '#0066FF', fontWeight: 600,
                        backgroundColor: '#E8F1FF', padding: '2px 10px', borderRadius: 4,
                      }}>
                        Cliquez sur l'image pour positionner le texte
                      </span>
                    </div>
                    <div
                      ref={previewRef}
                      style={{
                        width: '100%', aspectRatio: '16/9', borderRadius: 12,
                        overflow: 'hidden', position: 'relative', cursor: 'pointer',
                        backgroundColor: '#F4F5F7', border: formTextPosition !== '0.5,1.0' ? '2px solid #0066FF' : '1px solid #E0E0E0',
                        userSelect: 'none',
                      }}
                      onClick={handlePreviewClick}
                    onMouseMove={handlePreviewMouseMove}
                    onMouseUp={handlePreviewMouseUp}
                    onMouseLeave={handlePreviewLeave}
                  >
                      {formPreview ? (
                        <img src={formPreview} alt="Aperçu" style={{
                          width: '100%', height: '100%',
                          objectFit: formImageFit === 'CONTAIN' ? 'contain' : formImageFit === 'CENTER' ? 'none' : 'cover',
                          background: '#d0d0d0',
                          display: 'block',
                        }} />
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                          <span style={{ color: '#bbb', fontSize: 14 }}>Chargez d'abord une image</span>
                        </div>
                      )}

                      {/* position zone overlay on hover */}
                      {hoverZone && formPreview && !cropMode && (
                        POSITION_ZONES.map((z) => (
                          <div key={z} style={{
                            position: 'absolute',
                            ...getZoneStyle(z),
                            backgroundColor: z === hoverZone ? 'rgba(0,102,255,0.2)' : 'transparent',
                            border: z === hoverZone ? '2px solid #0066FF' : 'none',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            transition: 'all 0.1s',
                            pointerEvents: 'none',
                          }}>
                            {z === hoverZone && (
                              <span style={{
                                color: '#fff', fontWeight: 700, fontSize: 11,
                                backgroundColor: '#0066FF', padding: '2px 8px', borderRadius: 4,
                              }}>
                                {zoneIcon(z)} {zoneLabel(z)}
                              </span>
                            )}
                          </div>
                        ))
                      )}

                      {/* gradient overlay */}
                      <div style={{
                        position: 'absolute', inset: 0,
                        background: 'linear-gradient(transparent 40%, rgba(0,0,0,0.7))',
                        pointerEvents: 'none',
                      }} />

                      {/* text overlay at selected position – draggable */}
                      <div
                        onMouseDown={handleTextMouseDown}
                        style={{
                          position: 'absolute',
                          ...getTextPositionStyle(formTextPosition),
                          padding: '10px 14px',
                          cursor: textDragRef.current ? 'grabbing' : 'grab',
                          userSelect: 'none',
                          touchAction: 'none',
                        }}
                      >
                        {(formTitle || formSubtitle) ? (
                          <>
                            <div style={{
                              backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 8,
                              padding: '8px 14px', backdropFilter: 'blur(4px)',
                            }}>
                              {formTitle && <div style={{ color: '#fff', fontWeight: 700, fontSize: 16 }}>{formTitle}</div>}
                              {formSubtitle && <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 2 }}>{formSubtitle}</div>}
                            </div>
                            <div style={{ textAlign: 'center', marginTop: 4 }}>
                              <span style={{
                                fontSize: 10, color: '#fff', backgroundColor: 'rgba(0,102,255,0.7)',
                                padding: '2px 8px', borderRadius: 4, fontWeight: 600,
                              }}>
                                {zoneLabel(formTextPosition)}
                              </span>
                            </div>
                          </>
                        ) : (
                          <div style={{
                            color: 'rgba(255,255,255,0.4)', fontSize: 12,
                            backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 6,
                            padding: '6px 12px', border: '1px dashed rgba(255,255,255,0.3)',
                          }}>
                            Déposez le texte ici
                          </div>
                        )}
                      </div>

                      {/* layer labels */}
                      <div style={{ position: 'absolute', bottom: 8, right: 8, display: 'flex', gap: 4, pointerEvents: 'none' }}>
                        <span style={{ fontSize: 9, backgroundColor: 'rgba(0,0,0,0.5)', color: '#aaa', padding: '2px 6px', borderRadius: 4 }}>image</span>
                        <span style={{ fontSize: 9, backgroundColor: 'rgba(0,0,0,0.5)', color: '#aaa', padding: '2px 6px', borderRadius: 4 }}>overlay</span>
                        <span style={{ fontSize: 9, backgroundColor: 'rgba(0,0,0,0.5)', color: '#fff', padding: '2px 6px', borderRadius: 4 }}>texte</span>
                      </div>
                    </div>
                    {formPreview && (
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'center', marginTop: 6 }}>
                        {POSITION_ZONES.map((z) => (
                          <button
                            key={z}
                            onClick={() => setFormTextPosition(z)}
                            style={{
                              padding: '4px 10px', borderRadius: 6, border: 'none',
                              fontSize: 10, fontWeight: 700, cursor: 'pointer',
                              backgroundColor: formTextPosition === z ? '#0066FF' : '#F0F0F0',
                              color: formTextPosition === z ? '#fff' : '#666',
                            }}
                          >
                            {zoneIcon(z)} {zoneLabel(z)}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* ─── image upload ─── */}
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ fontSize: 12, fontWeight: 700, color: '#444', marginBottom: 6, display: 'block' }}>
                      Image
                    </label>
                    <div style={{
                      border: '2px dashed #D0D0D0', borderRadius: 10, padding: 12,
                      backgroundColor: '#FAFAFA', cursor: 'pointer',
                    }}
                      onClick={() => document.getElementById('carousel-image-input')?.click()}
                    >
                      <input
                        id="carousel-image-input"
                        type="file" accept="image/*"
                        style={{ display: 'none' }}
                        onChange={handleFileChange}
                      />
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 20 }}>📁</span>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#333' }}>
                            {formFile ? formFile.name : 'Cliquez pour choisir une image'}
                          </div>
                          {editing && !formFile && (
                            <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>
                              Laissez vide pour conserver l'image actuelle
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* ─── title + order ─── */}
                  <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                    <div style={{ flex: 2 }}>
                      <label style={{ fontSize: 12, fontWeight: 700, color: '#444', marginBottom: 6, display: 'block' }}>Titre</label>
                      <input
                        style={{ ...styles.input, marginBottom: 0 }}
                        placeholder="Titre de la slide"
                        value={formTitle}
                        onChange={(e) => setFormTitle(e.target.value)}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: 12, fontWeight: 700, color: '#444', marginBottom: 6, display: 'block' }}>Ordre</label>
                      <input
                        type="number" min={0}
                        style={{ ...styles.input, marginBottom: 0 }}
                        value={formOrder}
                        onChange={(e) => setFormOrder(parseInt(e.target.value, 10) || 0)}
                      />
                    </div>
                  </div>

                  {/* ─── subtitle ─── */}
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ fontSize: 12, fontWeight: 700, color: '#444', marginBottom: 6, display: 'block' }}>Sous-titre</label>
                    <input
                      style={styles.input}
                      placeholder="Sous-titre (optionnel)"
                      value={formSubtitle}
                      onChange={(e) => setFormSubtitle(e.target.value)}
                    />
                  </div>

                  {/* ─── image fit ─── */}
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ fontSize: 12, fontWeight: 700, color: '#444', marginBottom: 6, display: 'block' }}>Ajustement image</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {IMAGE_FITS.map((f) => (
                        <button
                          key={f.value}
                          onClick={() => setFormImageFit(f.value)}
                          style={{
                            flex: 1, padding: '10px 12px', borderRadius: 8, border: '2px solid',
                            cursor: 'pointer', fontSize: 12, fontWeight: 700,
                            borderColor: formImageFit === f.value ? '#0066FF' : '#E0E0E0',
                            backgroundColor: formImageFit === f.value ? '#E8F1FF' : '#fff',
                            color: formImageFit === f.value ? '#0066FF' : '#666',
                            transition: 'all 0.15s',
                          }}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* ─── active toggle ─── */}
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '12px 16px', borderRadius: 10,
                    backgroundColor: '#FAFAFA', border: '1px solid #EEE',
                    marginBottom: 20,
                  }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#333' }}>Slide active</div>
                      <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>
                        Les slides inactives ne sont pas visibles dans l'application
                      </div>
                    </div>
                    <button
                      onClick={() => setFormActive(!formActive)}
                      style={{
                        width: 44, height: 24, borderRadius: 12, border: 'none',
                        backgroundColor: formActive ? '#2E7D32' : '#BDBDBD',
                        cursor: 'pointer', position: 'relative', transition: 'background 0.2s',
                        flexShrink: 0,
                      }}
                    >
                      <div style={{
                        width: 18, height: 18, borderRadius: 9,
                        backgroundColor: '#fff', position: 'absolute',
                        top: 3, left: formActive ? 23 : 3,
                        transition: 'left 0.2s', boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
                      }} />
                    </button>
                  </div>

                  {/* ─── actions ─── */}
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button
                      style={{
                        flex: 1, padding: '12px 20px', borderRadius: 10,
                        border: '2px solid #E0E0E0', background: '#fff',
                        cursor: 'pointer', fontWeight: 600, fontSize: 14, color: '#333',
                      }}
                      onClick={() => setShowForm(false)}
                    >
                      Annuler
                    </button>
                    <button
                      style={{
                        flex: 1, padding: '12px 20px', borderRadius: 10, border: 'none',
                        background: '#0066FF', color: '#fff',
                        fontWeight: 600, fontSize: 14, cursor: 'pointer',
                        opacity: (!formTitle.trim() || submitting) ? 0.6 : 1,
                      }}
                      onClick={handleSubmit}
                      disabled={!formTitle.trim() || submitting}
                    >
                      {submitting ? 'Envoi en cours...' : editing ? 'Enregistrer' : 'Ajouter la slide'}
                    </button>
                  </div>
                </>
              )}
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

function getZoneStyle(zone: string): React.CSSProperties {
  const map: Record<string, React.CSSProperties> = {
    '0.5,0.0': { top: 0, left: 0, right: 0, height: '30%' },
    '0.5,1.0': { bottom: 0, left: 0, right: 0, height: '30%' },
    '0.0,0.5': { top: '30%', left: 0, bottom: '30%', width: '30%' },
    '1.0,0.5': { top: '30%', right: 0, bottom: '30%', width: '30%' },
    '0.5,0.5': { top: '30%', left: '30%', bottom: '30%', right: '30%' },
    // backward compat
    'TOP': { top: 0, left: 0, right: 0, height: '30%' },
    'BOTTOM': { bottom: 0, left: 0, right: 0, height: '30%' },
    'LEFT': { top: '30%', left: 0, bottom: '30%', width: '30%' },
    'RIGHT': { top: '30%', right: 0, bottom: '30%', width: '30%' },
    'CENTER': { top: '30%', left: '30%', bottom: '30%', right: '30%' },
  };
  return map[zone] || {};
}

function getTextPositionStyle(pos: string): React.CSSProperties {
  const match = pos?.match(/^([\d.]+),([\d.]+)$/);
  if (match) {
    return {
      left: `${parseFloat(match[1]) * 100}%`,
      top: `${parseFloat(match[2]) * 100}%`,
      transform: 'translate(-50%, -50%)',
    };
  }
  switch (pos) {
    case 'TOP': return { top: 0, left: 0, right: 0 };
    case 'LEFT': return { top: 0, left: 0, bottom: 0, width: '50%' };
    case 'RIGHT': return { top: 0, right: 0, bottom: 0, width: '50%' };
    case 'CENTER': return { top: '50%', left: 0, right: 0, transform: 'translateY(-50%)' };
    default: return { bottom: 0, left: 0, right: 0 };
  }
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
