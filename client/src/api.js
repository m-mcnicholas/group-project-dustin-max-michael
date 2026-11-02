// Thin fetch() wrapper. Every call goes to /api (proxied to Express in dev).
async function request(method, path, body) {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  // auth
  me: () => request('GET', '/auth/me'),
  login: (email, password) => request('POST', '/auth/login', { email, password }),
  signup: (name, email, password) => request('POST', '/auth/signup', { name, email, password }),
  logout: () => request('POST', '/auth/logout'),

  // colleges
  topics: () => request('GET', '/colleges/topics'),
  colleges: (search = '') => request('GET', `/colleges?search=${encodeURIComponent(search)}`),
  college: (id) => request('GET', `/colleges/${id}`),
  createCollege: (data) => request('POST', '/colleges', data),
  addRequirement: (collegeId, data) => request('POST', `/colleges/${collegeId}/requirements`, data),

  // my list
  myColleges: () => request('GET', '/my/colleges'),
  addMyCollege: (college_id, round) => request('POST', '/my/colleges', { college_id, round }),
  updateMyCollege: (userCollegeId, data) => request('PATCH', `/my/colleges/${userCollegeId}`, data),
  removeMyCollege: (userCollegeId) => request('DELETE', `/my/colleges/${userCollegeId}`),
  setRequirementStatus: (reqId, status) => request('PATCH', `/my/requirements/${reqId}`, { status }),
  acceptReuse: (reqId) => request('PATCH', `/my/requirements/${reqId}`, { action: 'accept' }),
  dismissReuse: (reqId) => request('PATCH', `/my/requirements/${reqId}`, { action: 'dismiss' }),

  // tags
  tags: () => request('GET', '/tags'),
  createTag: (name, color) => request('POST', '/tags', { name, color }),
  updateTag: (id, data) => request('PATCH', `/tags/${id}`, data),
  deleteTag: (id) => request('DELETE', `/tags/${id}`),

  // essays
  essays: () => request('GET', '/essays'),
  essay: (id) => request('GET', `/essays/${id}`),
  createEssay: (data) => request('POST', '/essays', data),
  updateEssay: (id, data) => request('PATCH', `/essays/${id}`, data),
  deleteEssay: (id) => request('DELETE', `/essays/${id}`),
  assignEssay: (id, requirement_id) => request('POST', `/essays/${id}/assign`, { requirement_id }),
  unassignEssay: (id, requirementId) => request('DELETE', `/essays/${id}/assign/${requirementId}`),

  // dashboard
  dashboard: (tagId) => request('GET', `/dashboard${tagId ? `?tag=${tagId}` : ''}`),
};
