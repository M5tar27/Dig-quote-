"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HelpCircle, X, ChevronDown } from "lucide-react";

type HelpTopic = {
  question: string;
  answer: string;
};

const TOPICS: HelpTopic[] = [
  {
    question: "How do I create a new quote?",
    answer:
      "From your dashboard, start a new quote and snap 3-6 photos of the job site. DigQuote's AI reads the photos and generates a priced estimate in about 60 seconds — no manual measuring needed.",
  },
  {
    question: "The AI estimate looks off — can I fix it?",
    answer:
      "Yes. Every line item on a quote is editable. Just adjust the quantity or rate for excavation labor, gravel, disposal, or any other item, and the subtotal, markup, and total all recalculate automatically.",
  },
  {
    question: "What if I don't want to use photos at all?",
    answer:
      "Use manual mode — enter the square footage and depth directly, and DigQuote calculates the estimate the same way, just without the AI photo step.",
  },
  {
    question: "How do I send a quote to my client?",
    answer:
      "Click Send on the quote page. It emails your client a branded PDF and a link where they can review and approve the estimate themselves — no login required on their end.",
  },
  {
    question: "What do the quote statuses mean?",
    answer:
      "Draft = not sent yet. Sent = emailed to the client. Won = the client approved it. Lost = the job didn't happen. You can change a quote's status manually any time from its page.",
  },
  {
    question: "Where's the materials checklist?",
    answer:
      "Once a quote's status is Won, DigQuote automatically builds a Materials checklist on that quote's page from the gravel/sand in the estimate. Update each item's status — Needed, Ordered, Delivered, Installed — and add any extra materials by hand.",
  },
  {
    question: "How do I change my pricing rates?",
    answer:
      "Go to Settings to update your excavator rate, labor rate, gravel/disposal costs, equipment rate, and markup/profit percentages. Every future AI estimate uses these numbers automatically.",
  },
  {
    question: "Can my crew have their own logins?",
    answer:
      "Yes — from Settings, admins can invite team members and assign them a role (admin or estimator) so more than one person can create and manage quotes.",
  },
];

export function HelpPopup() {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(0);

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        size="icon"
        className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full shadow-lg"
        aria-label="Open help"
      >
        <HelpCircle className="h-6 w-6" />
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-end bg-black/20 p-4 sm:items-center sm:justify-center"
          onClick={() => setOpen(false)}
        >
          <Card
            className="max-h-[80vh] w-full max-w-md overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <CardHeader className="flex-row items-center justify-between space-y-0 border-b">
              <CardTitle className="text-base">Help & navigation</CardTitle>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setOpen(false)} aria-label="Close help">
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="max-h-[65vh] space-y-1 overflow-y-auto pt-4">
              {TOPICS.map((topic, i) => {
                const isOpen = expanded === i;
                return (
                  <div key={topic.question} className="border-b last:border-b-0">
                    <button
                      className="flex w-full items-center justify-between gap-3 py-3 text-left"
                      onClick={() => setExpanded(isOpen ? null : i)}
                    >
                      <span className="text-sm font-medium">{topic.question}</span>
                      <ChevronDown
                        className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`}
                      />
                    </button>
                    {isOpen && (
                      <p className="pb-3 text-sm text-muted-foreground">{topic.answer}</p>
                    )}
                  </div>
                );
              })}
              <p className="pt-3 text-center text-xs text-muted-foreground">
                Still stuck? Reach out from the Contact page.
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
