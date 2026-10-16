// T039 · P-05 en phone: lista de secciones que abren pantallas (ui-spec P-05 y maqueta T037).
import { ChevronLeft } from 'lucide-react';
import {
  ProfileList,
  ProfileNotice,
  ProfileSectionBody,
  ProfileUser,
  sectionLabel,
  SignOutButton,
} from './ProfileParts';
import type { ProfileModel } from './useProfile';

export function ProfilePhone({ model }: { model: ProfileModel }) {
  if (model.section === null)
    return (
      <div className="profile profile--phone">
        <ProfileUser model={model} />
        <ProfileNotice model={model} />
        <ProfileList model={model} />
        <SignOutButton model={model} />
      </div>
    );
  return (
    <div className="profile profile--phone">
      {!model.mustChange && (
        <button type="button" className="profile-back" onClick={model.back}>
          <ChevronLeft size={18} aria-hidden="true" /> Perfil
        </button>
      )}
      <h2 className="profile-title">{sectionLabel(model.section)}</h2>
      <ProfileNotice model={model} />
      <ProfileSectionBody model={model} section={model.section} />
    </div>
  );
}
