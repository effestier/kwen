import { BRAND } from '@/lib/brand/config';

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-[var(--text-primary)] mb-2">Privacy Policy</h1>
        <p className="text-sm text-[var(--text-muted)] mb-6">Last updated: May 2026</p>

        <div className="space-y-5 text-[var(--text-secondary)] text-sm leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">1. Information We Collect</h2>
            <p>
              When you create an account on {BRAND.name}, we collect your email address for authentication purposes.
              We use OTP (one-time password) based authentication and do not store passwords.
            </p>
            <p className="mt-3">
              Profile information you provide, such as your display name, username, bio, and profile picture,
              is stored to provide the core social experience.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">2. How We Use Your Information</h2>
            <p>We use your information to:</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>Provide and maintain the {BRAND.name} service</li>
              <li>Authenticate your account and prevent unauthorized access</li>
              <li>Display your profile and content to other users</li>
              <li>Send notifications about activity relevant to you</li>
              <li>Improve and protect the platform</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">3. Content You Share</h2>
            <p>
              Posts, comments, messages, and stories you create are stored on our servers.
              You control the visibility of your content through your privacy settings.
              You can delete your content at any time.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">4. Data Storage and Security</h2>
            <p>
              Your data is stored securely using Supabase infrastructure with encryption at rest and in transit.
              We implement industry-standard security measures to protect your personal information.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">5. Third-Party Services</h2>
            <p>
              We use Supabase for authentication, database, and file storage.
              We use Cloudflare for security and performance.
              These services process data on our behalf in accordance with their own privacy policies.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">6. Your Rights</h2>
            <p>You have the right to:</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>Access the personal data we hold about you</li>
              <li>Request correction of inaccurate data</li>
              <li>Request deletion of your account and associated data</li>
              <li>Export your data</li>
              <li>Opt out of non-essential communications</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">7. Cookies</h2>
            <p>
              We use essential cookies to maintain your session and authentication state.
              We do not use tracking cookies or advertising cookies.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">8. Children&apos;s Privacy</h2>
            <p>
              {BRAND.name} is not intended for children under 13. We do not knowingly collect
              personal information from children under 13.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">9. Changes to This Policy</h2>
            <p>
              We may update this privacy policy from time to time. We will notify you of any
              significant changes by posting the new policy on this page.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">10. Contact</h2>
            <p>
              If you have questions about this privacy policy, contact us at{' '}
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
