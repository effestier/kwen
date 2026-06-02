import { BRAND } from '@/lib/brand/config';

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-[var(--text-primary)] mb-2">Terms of Service</h1>
        <p className="text-sm text-[var(--text-muted)] mb-6">Last updated: May 2026</p>

        <div className="space-y-5 text-[var(--text-secondary)] text-sm leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">1. Acceptance of Terms</h2>
            <p>
              By accessing or using {BRAND.name}, you agree to be bound by these Terms of Service.
              If you do not agree, do not use the service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">2. Your Account</h2>
            <p>
              You are responsible for maintaining the security of your account.
              You must provide a valid email address for authentication.
              You may not impersonate others or create accounts for unauthorized purposes.
            </p>
            <p className="mt-3">
              You must be at least 13 years old to use {BRAND.name}.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">3. Content</h2>
            <p>
              You retain ownership of content you post on {BRAND.name}. By posting content,
              you grant us a non-exclusive license to display, distribute, and store it as part of the service.
            </p>
            <p className="mt-3">You agree not to post content that:</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>Violates the law or infringes on others&apos; rights</li>
              <li>Contains spam, scams, or misleading information</li>
              <li>Promotes violence, hatred, or discrimination</li>
              <li>Contains malware or harmful code</li>
              <li>Violates another person&apos;s privacy</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">4. Prohibited Conduct</h2>
            <p>You agree not to:</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>Use automated tools to access or scrape the service</li>
              <li>Attempt to gain unauthorized access to other accounts or systems</li>
              <li>Interfere with the proper functioning of the service</li>
              <li>Harass, bully, or intimidate other users</li>
              <li>Create multiple accounts for abusive purposes</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">5. Messages and Communications</h2>
            <p>
              Direct messages on {BRAND.name} are private communications between the participants.
              We do not read your messages. You may not use messaging for spam or unsolicited promotions.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">6. Termination</h2>
            <p>
              We may suspend or terminate your account if you violate these terms.
              You may delete your account at any time through your settings.
              Upon termination, your right to use the service ceases immediately.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">7. Disclaimers</h2>
            <p>
              {BRAND.name} is provided &ldquo;as is&rdquo; without warranties of any kind.
              We do not guarantee uninterrupted or error-free service.
              We are not responsible for content posted by users.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">8. Limitation of Liability</h2>
            <p>
              To the maximum extent permitted by law, {BRAND.name} shall not be liable for any
              indirect, incidental, special, or consequential damages arising from your use of the service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">9. Changes to Terms</h2>
            <p>
              We may modify these terms at any time. Continued use of the service after changes
              constitutes acceptance of the new terms. We will notify users of significant changes.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">10. Contact</h2>
            <p>
              Questions about these terms? Contact us at{' '}
              <a href={`mailto:${BRAND.social.supportEmail}`} className="text-[var(--accent-primary)]">
                {BRAND.social.supportEmail}
              </a>.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
