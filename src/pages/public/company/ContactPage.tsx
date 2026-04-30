
import { Footer } from '../../../components/layout/Footer';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Textarea } from '../../../components/ui/text-area';
import { Checkbox } from '../../../components/ui/checkbox';
import { Mail, Phone, MapPin, CheckCircle2 } from 'lucide-react';
import { useState } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { Link } from 'react-router-dom';

export function ContactPage() {
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    message: '',
  });
  const [acceptedPrivacyPolicy, setAcceptedPrivacyPolicy] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const sendMessage = useMutation(api.messages.sendMessage);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!acceptedPrivacyPolicy) return;

    setIsLoading(true);
    try {
      await sendMessage({
        ...formData,
        acceptedPrivacyPolicy,
      });
      setIsSubmitted(true);
      setFormData({ name: '', email: '', message: '' });
      setAcceptedPrivacyPolicy(false);
    } catch (error) {
      console.error('Error sending message:', error);
      // You could add an error message here
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { id, value } = e.target;
    setFormData((prev) => ({ ...prev, [id]: value }));
  };

  return (
    <div className="min-h-screen flex flex-col">
      

      <main className="flex-grow">
        <section className="py-20">
          <div className="container mx-auto px-4">
            <div className="max-w-5xl mx-auto">
              <h1 className="text-4xl font-bold mb-12 text-center">Kontaktiere uns</h1>

              <div className="grid md:grid-cols-2 gap-12 bg-card border rounded-2xl overflow-hidden shadow-lg">
                <div className="p-8 md:p-12 bg-primary text-primary-foreground">
                  <h2 className="text-2xl font-bold mb-6">Wir sind für dich da</h2>
                  <p className="mb-8 opacity-90">
                    Hast du Fragen zu BazarPro oder benötigst du Unterstützung bei der Einrichtung?
                    Unser Team steht dir gerne zur Verfügung.
                  </p>

                  <div className="space-y-6">
                    <div className="flex items-center gap-4">
                      <Mail className="h-6 w-6" />
                      <span>kontakt@bazarpro.de</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <Phone className="h-6 w-6" />
                      <span>+49 (0) 7141 9132745</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <MapPin className="h-6 w-6" />
                      <span>
                        Ivo Zeitz
                        <br />
                        Syrlinstraße 8
                        <br />
                        89073 Ulm
                      </span>
                    </div>
                  </div>
                </div>

                <div className="p-8 md:p-12 flex flex-col justify-center">
                  {isSubmitted ? (
                    <div className="text-center space-y-4 animate-in fade-in zoom-in duration-300">
                      <div className="flex justify-center">
                        <CheckCircle2 className="h-16 w-16 text-green-500" />
                      </div>
                      <h2 className="text-2xl font-bold">Vielen Dank!</h2>
                      <p className="text-muted-foreground">
                        Deine Nachricht wurde erfolgreich versendet. Wir werden uns in Kürze bei dir
                        melden.
                      </p>
                      <Button variant="outline" onClick={() => setIsSubmitted(false)}>
                        Weitere Nachricht senden
                      </Button>
                    </div>
                  ) : (
                    <form onSubmit={handleSubmit} className="space-y-6">
                      <div>
                        <label htmlFor="name" className="block text-sm font-medium mb-2">
                          Name
                        </label>
                        <Input
                          id="name"
                          placeholder="Dein Name"
                          required
                          value={formData.name}
                          onChange={handleInputChange}
                        />
                      </div>
                      <div>
                        <label htmlFor="email" className="block text-sm font-medium mb-2">
                          E-Mail
                        </label>
                        <Input
                          id="email"
                          type="email"
                          placeholder="deine@email.de"
                          required
                          value={formData.email}
                          onChange={handleInputChange}
                        />
                      </div>
                      <div>
                        <label htmlFor="message" className="block text-sm font-medium mb-2">
                          Nachricht
                        </label>
                        <Textarea
                          id="message"
                          placeholder="Wie können wir dir helfen?"
                          className="min-h-[150px]"
                          required
                          value={formData.message}
                          onChange={handleInputChange}
                        />
                      </div>
                      <div className="flex items-start space-x-2">
                        <Checkbox
                          id="privacy"
                          checked={acceptedPrivacyPolicy}
                          onCheckedChange={(checked) => setAcceptedPrivacyPolicy(!!checked)}
                          required
                        />
                        <label
                          htmlFor="privacy"
                          className="text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                        >
                          Ich akzeptiere die{' '}
                          <Link
                            to="/privacy"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline"
                          >
                            Datenschutzbedingungen
                          </Link>
                          .
                        </label>
                      </div>
                      <Button
                        type="submit"
                        className="w-full"
                        disabled={!acceptedPrivacyPolicy || isLoading}
                      >
                        {isLoading ? 'Wird gesendet...' : 'Nachricht senden'}
                      </Button>
                    </form>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
