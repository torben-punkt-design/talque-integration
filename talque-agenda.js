(() => {
  'use strict';

  const container = document.getElementById('talque-custom-agenda');
  if (!container) return;

  const CONFIG = {
    orgId: 'CMQXQ6NcH1xWKy5diDC',
    roomId: container.dataset.roomId || '',
    defaultStageName: container.dataset.stageName || 'Stage',
    lectureEndpoint: 'https://event.talque.com/api/v1/lecture/list',
    speakerEndpoint: 'https://event.talque.com/api/v1/speaker/list',
    hidePastEvents: true,
    selectors: {
      modalOverlay: 'tq-modal-overlay',
      modalCloseBtn: 'tq-modal-close-btn'
    }
  };

  let state = { lectures: [], speakersMap: {} };

  const escapeHTML = (str) => typeof str !== 'string' ? '' : str.replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag));
  const formatTime = (ts) => ts ? new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '00:00';
  const formatDateRange = (s, e) => {
    if (!s || !e) return '';
    const dateStr = new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return `${dateStr}, ${formatTime(s)} - ${formatTime(e)} GMT+2`;
  };

  async function fetchSpeakersMap() {
    try {
      const res = await fetch(CONFIG.speakerEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId: CONFIG.orgId, tags: [] })
      });
      if (!res.ok) return {};
      const data = await res.json();
      const map = {};
      if (data.success && Array.isArray(data.speakers)) {
        data.speakers.forEach(sp => {
          const id = sp.profileId || sp.speakerId || sp.id || sp._id || sp.userId;
          if (id) {
            let name = sp.name || sp.displayName || `${sp.firstName || ''} ${sp.lastName || ''}`.trim();
            const role = sp.role || sp.position || sp.title || sp.subtitle || sp.company || sp.organisation || '';
            const bio = sp.bio || sp.description || sp.about || sp.info || sp.summary || '';
            const avatar = sp.avatar || sp.image || sp.imageUrl || sp.picture || sp.photo || sp.avatarUrl || null;
            const website = sp.website || sp.url || null;
            const isModerator = sp.isModerator || sp.type === 'moderator' || (role && role.toLowerCase().includes('moderator'));
            map[id] = { name, role, bio, avatar, website, isModerator };
          }
        });
      }
      return map;
    } catch (e) { return {}; }
  }

  async function initAgendaApp() {
    if (!CONFIG.roomId) return;

    try {
      const [speakerMap, lectureRes] = await Promise.all([
        fetchSpeakersMap(),
        fetch(CONFIG.lectureEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orgId: CONFIG.orgId, tags: [] })
        })
      ]);

      state.speakersMap = speakerMap;
      if (!lectureRes.ok) throw new Error();
      const data = await lectureRes.json();

      if (!data.success || !Array.isArray(data.lectures)) {
        container.innerHTML = '<p style="text-align:center; padding:20px;">Keine Veranstaltungen gefunden.</p>';
        return;
      }

      const now = Date.now();
      const roomLectures = data.lectures
        .filter(l => l && l.roomId === CONFIG.roomId && (!CONFIG.hidePastEvents || !l.period?.end || new Date(l.period.end).getTime() >= now))
        .sort((a, b) => (a.period?.start || 0) - (b.period?.start || 0));

      if (roomLectures.length === 0) {
        container.innerHTML = '<p style="text-align:center; padding:20px;">Keine anstehenden Veranstaltungen mehr für diesen Raum.</p>';
        return;
      }

      state.lectures = roomLectures.map(l => {
        const title = l.name?.DE_DE || l.name?.EN_US || 'Unbenannter Vortrag';
        let description = l.description?.DE_DE || l.description?.EN_US || l.descriptionHtml?.DE_DE || l.descriptionHtml?.EN_US || '';
        const speakers = [], moderators = [];

        if (Array.isArray(l.speakers)) {
          l.speakers.forEach(spEntry => {
            const spId = typeof spEntry === 'string' ? spEntry : (spEntry.profileId || spEntry.speakerId || spEntry.id);
            if (spId && state.speakersMap[spId]) {
              const p = state.speakersMap[spId];
              p.isModerator ? moderators.push(p) : speakers.push(p);
            }
          });
        }

        const allPersons = [...speakers, ...moderators];
        return {
          id: l.lectureId || l.id,
          title, description,
          startTime: formatTime(l.period?.start),
          endTime: formatTime(l.period?.end),
          formattedDateRange: formatDateRange(l.period?.start, l.period?.end),
          speakerNamesText: allPersons.map(p => p.name).filter(Boolean).join(', '),
          speakerRolesText: allPersons.map(p => p.role).filter(Boolean).join(' | '),
          allPersons, speakersList: speakers, moderatorsList: moderators,
          roomName: l.roomName || CONFIG.defaultStageName
        };
      });

      renderAgenda();
      setupEventListeners();
    } catch (error) {
      container.innerHTML = '<p style="color:red; text-align:center; padding:20px;">Fehler beim Laden der Agenda.</p>';
    }
  }

  function renderAgenda() {
    const htmlList = state.lectures.map((item, index) => {
      const avatarsHtml = item.allPersons?.length
        ? `<div class="speaker-avatars-container">${item.allPersons.filter(p => p.avatar).map(p => `<img src="${escapeHTML(p.avatar)}" class="speaker-avatar" alt="${escapeHTML(p.name)}">`).join('')}</div>`
        : '';

      return `
        <div class="agenda-row">
          <div class="time-sidebar">
            <span class="label-from">from</span>
            <span class="time-main">${escapeHTML(item.startTime)}</span>
          </div>

          <div class="agenda-card" data-index="${index}">
            <div class="card-content-wrapper">
              <div class="card-times">
                <span class="start-time">${escapeHTML(item.startTime)}</span>
                <span class="end-time">${escapeHTML(item.endTime)}</span>
              </div>
              <div class="card-details">
                <h3 class="card-title">${escapeHTML(item.title)}</h3>
                ${item.speakerNamesText ? `<div class="card-speakers-monospace">${escapeHTML(item.speakerNamesText)}</div>` : ''}
                <div class="card-stage-monospace">${escapeHTML(item.roomName)}</div>
              </div>
            </div>
            ${avatarsHtml}
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = `<div class="agenda-container">${htmlList}</div>`;
  }

  function renderPersonCard(p) {
    return `
      <div class="tq-modal-speaker-card">
        <div class="tq-speaker-info">
          <div class="tq-speaker-name">${escapeHTML(p.name || 'Unbenannt')}</div>
          ${p.role ? `<div class="tq-speaker-role">${escapeHTML(p.role)}</div>` : ''}
          ${p.bio ? `<div class="tq-speaker-bio">${escapeHTML(p.bio)}</div>` : ''}
          ${p.website ? `<a href="${escapeHTML(p.website)}" target="_blank" rel="noopener" class="tq-speaker-link">${escapeHTML(p.website)}</a>` : ''}
        </div>
        ${p.avatar ? `<img src="${escapeHTML(p.avatar)}" class="tq-speaker-avatar-large" alt="Avatar">` : ''}
      </div>
    `;
  }

  function openModal(index) {
    const data = state.lectures[index];
    if (!data) return;

    document.getElementById('tq-modal-title').textContent = data.title;
    const descElem = document.getElementById('tq-modal-description');
    if (data.description?.trim()) {
      descElem.innerHTML = data.description;
      descElem.classList.remove('u-hidden');
    } else { descElem.classList.add('u-hidden'); }

    document.getElementById('tq-modal-time-text').textContent = data.formattedDateRange;
    document.getElementById('tq-modal-location-text').textContent = data.roomName;

    const spSec = document.getElementById('tq-modal-speakers-section');
    const spList = document.getElementById('tq-modal-speakers-list');
    if (data.speakersList?.length) {
      spList.innerHTML = data.speakersList.map(renderPersonCard).join('');
      spSec.classList.remove('u-hidden');
    } else { spSec.classList.add('u-hidden'); }

    const modSec = document.getElementById('tq-modal-moderators-section');
    const modList = document.getElementById('tq-modal-moderators-list');
    if (data.moderatorsList?.length) {
      modList.innerHTML = data.moderatorsList.map(renderPersonCard).join('');
      modSec.classList.remove('u-hidden');
    } else { modSec.classList.add('u-hidden'); }

    document.getElementById(CONFIG.selectors.modalOverlay).classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    const overlay = document.getElementById(CONFIG.selectors.modalOverlay);
    if (overlay) overlay.classList.remove('active');
    document.body.style.overflow = '';
  }

  function setupEventListeners() {
    container.addEventListener('click', (e) => {
      const card = e.target.closest('.agenda-card');
      if (card?.dataset.index !== undefined) openModal(parseInt(card.dataset.index, 10));
    });
    document.getElementById(CONFIG.selectors.modalCloseBtn)?.addEventListener('click', closeModal);
    const overlay = document.getElementById(CONFIG.selectors.modalOverlay);
    overlay?.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAgendaApp);
  } else {
    initAgendaApp();
  }
})();
