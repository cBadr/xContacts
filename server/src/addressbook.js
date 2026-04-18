// Fetch contacts directly from providers' address books (not from messages).
// Uses the existing OAuth access token. Requires extra scopes requested at
// sign-in time (see oauth.js).

const GOOGLE_PEOPLE = 'https://people.googleapis.com/v1/people/me/connections';
const GOOGLE_OTHER  = 'https://people.googleapis.com/v1/otherContacts';
const MS_CONTACTS   = 'https://graph.microsoft.com/v1.0/me/contacts';
const MS_FOLDERS    = 'https://graph.microsoft.com/v1.0/me/contactFolders';

function norm(s) { return String(s || '').trim().toLowerCase(); }

async function fetchJSON(url, accessToken) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message || data?.error_description || data?.error || res.statusText;
    throw new Error(`${res.status} ${msg}`);
  }
  return data;
}

// ========== Google ==========
function mapGooglePerson(p, source) {
  const name = p.names?.find(n => n.metadata?.primary)?.displayName
    || p.names?.[0]?.displayName || '';
  const org = p.organizations?.[0]?.name || '';
  const out = [];
  for (const em of (p.emailAddresses || [])) {
    const email = norm(em.value);
    if (!email) continue;
    out.push({ email, name, organization: org, source, raw: { type: em.type || null } });
  }
  return out;
}

export async function fetchGoogleAddressBook(accessToken, onProgress) {
  const all = [];
  let page = '';
  let count = 0;
  do {
    const u = new URL(GOOGLE_PEOPLE);
    u.searchParams.set('personFields', 'names,emailAddresses,organizations');
    u.searchParams.set('pageSize', '1000');
    if (page) u.searchParams.set('pageToken', page);
    const data = await fetchJSON(u.toString(), accessToken);
    for (const p of data.connections || []) all.push(...mapGooglePerson(p, 'google:contacts'));
    count += (data.connections || []).length;
    onProgress?.({ source: 'google:contacts', fetched: count });
    page = data.nextPageToken || '';
  } while (page);

  // "Other contacts" = people you've emailed but didn't save explicitly.
  try {
    page = '';
    count = 0;
    do {
      const u = new URL(GOOGLE_OTHER);
      u.searchParams.set('readMask', 'names,emailAddresses');
      u.searchParams.set('pageSize', '1000');
      if (page) u.searchParams.set('pageToken', page);
      const data = await fetchJSON(u.toString(), accessToken);
      for (const p of data.otherContacts || []) all.push(...mapGooglePerson(p, 'google:other'));
      count += (data.otherContacts || []).length;
      onProgress?.({ source: 'google:other', fetched: count });
      page = data.nextPageToken || '';
    } while (page);
  } catch (e) {
    onProgress?.({ source: 'google:other', error: e.message });
  }

  return all;
}

// ========== Microsoft ==========
function mapMsContact(c, source) {
  const out = [];
  const name = c.displayName || [c.givenName, c.surname].filter(Boolean).join(' ');
  const org = c.companyName || '';
  for (const em of (c.emailAddresses || [])) {
    const email = norm(em.address);
    if (!email) continue;
    out.push({ email, name, organization: org, source });
  }
  return out;
}

async function fetchMsFolder(folderPath, accessToken, onProgress, source) {
  const all = [];
  let url = `${folderPath}?$top=100&$select=displayName,givenName,surname,emailAddresses,companyName`;
  let fetched = 0;
  while (url) {
    const data = await fetchJSON(url, accessToken);
    for (const c of data.value || []) all.push(...mapMsContact(c, source));
    fetched += (data.value || []).length;
    onProgress?.({ source, fetched });
    url = data['@odata.nextLink'] || null;
  }
  return all;
}

export async function fetchMicrosoftAddressBook(accessToken, onProgress) {
  const all = [];
  all.push(...await fetchMsFolder(MS_CONTACTS, accessToken, onProgress, 'ms:contacts'));
  try {
    const folders = await fetchJSON(`${MS_FOLDERS}?$select=id,displayName`, accessToken);
    for (const f of folders.value || []) {
      const items = await fetchMsFolder(`${MS_FOLDERS}/${f.id}/contacts`, accessToken, onProgress, `ms:${f.displayName}`);
      all.push(...items);
    }
  } catch (e) {
    onProgress?.({ source: 'ms:folders', error: e.message });
  }
  return all;
}

// ========== Public API ==========
export async function fetchAddressBook(provider, accessToken, onProgress) {
  if (!accessToken) return [];
  if (provider === 'google') return fetchGoogleAddressBook(accessToken, onProgress);
  if (provider === 'microsoft') return fetchMicrosoftAddressBook(accessToken, onProgress);
  return [];
}
