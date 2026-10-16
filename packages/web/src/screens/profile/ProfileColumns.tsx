// T039 · P-05 en TAB y ESC: secciones a la izquierda y contenido a la derecha (ui-spec P-05 y maqueta T037).
import { PROFILE_SECTIONS, type ProfileModel } from './useProfile';
import { ProfileNotice, ProfileSectionBody, ProfileUser, sectionLabel, SignOutButton } from './ProfileParts';

export function ProfileColumns({ model }: { model: ProfileModel }) {
  const section = model.section ?? 'sesiones';
  return (
    <div className="profile profile--columns">
      <nav className="profile-nav" aria-label="Secciones del perfil">
        <ProfileUser model={model} />
        <ul>
          {PROFILE_SECTIONS.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                aria-current={s.id === section ? 'page' : undefined}
                disabled={model.mustChange && s.id !== 'contrasena'}
                onClick={() => model.open(s.id)}
              >
                {s.label}
              </button>
            </li>
          ))}
        </ul>
        <SignOutButton model={model} />
      </nav>
      <section className="profile-content" aria-labelledby="perfil-seccion">
        <h2 id="perfil-seccion" className="profile-title">
          {sectionLabel(section)}
        </h2>
        <ProfileNotice model={model} />
        <ProfileSectionBody model={model} section={section} />
      </section>
    </div>
  );
}
