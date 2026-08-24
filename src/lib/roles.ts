export const ROLE_KEYS = [
  'super_admin',
  'framework_coding_mod',
  'content_mod',
  'community_mod',
  'issues_mod',
  'science_supervisor',
  'commerce_supervisor',
  'humanities_supervisor',
  'science_volunteer',
  'commerce_volunteer',
  'humanities_volunteer',
  'framework_coding_volunteer',
  'ai_notegen_volunteer',
  'ai_notechk_volunteer',
  'verified_member',
] as const;

export type RoleKey = (typeof ROLE_KEYS)[number];
export type PresenceStatus = 'online' | 'dnd';

export const ROLE_LABELS: Record<RoleKey, string> = {
  super_admin: 'Super Admin',
  framework_coding_mod: 'NoteBooks-Framework [Coding] Mod',
  content_mod: 'NoteBooks-Content Mod',
  community_mod: 'Community Mod',
  issues_mod: 'Issues Mod',
  science_supervisor: 'NoteBooks-Science Supervisor',
  commerce_supervisor: 'NoteBooks-Commerce Supervisor',
  humanities_supervisor: 'NoteBooks-Humanities Supervisor',
  science_volunteer: 'NoteBooks-Science Volunteer',
  commerce_volunteer: 'NoteBooks-Commerce Volunteer',
  humanities_volunteer: 'NoteBooks-Humanities Volunteer',
  framework_coding_volunteer: 'NoteBooks-Framework [Coding] Volunteer',
  ai_notegen_volunteer: 'AI-NoteGen Volunteer',
  ai_notechk_volunteer: 'AI-NoteChk Volunteer',
  verified_member: 'Verified Member',
};

export const PRESENCE_LABELS: Record<PresenceStatus, string> = {
  online: 'Online',
  dnd: 'Do Not Disturb',
};

export function isRoleKey(value: unknown): value is RoleKey {
  return typeof value === 'string' && (ROLE_KEYS as readonly string[]).includes(value);
}

export function isPresenceStatus(value: unknown): value is PresenceStatus {
  return value === 'online' || value === 'dnd';
}
