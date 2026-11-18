import assert from 'node:assert/strict';
import test from 'node:test';

import DEMO from '../../config/demo-proof.json' with { type: 'json' };
import { demoProof, withFacts } from '../scaffold-site-proof.mjs';

// site13 blind audit H2: Seafern Label was "Swimwear, UK" on the client wall and "Founder, France" in its testimonial.
const made = () => demoProof({ demo: DEMO, facts: new Map(), products: [{ product: 'bikini', route: '/bikini-manufacturer/' }], line: 'swimwear', seed: 'Strandmill' });

test('a stand-in testimonial is of its client\'s country, as the client wall says', () => {
  const proof = made();
  const wall = new Map(proof.clients.map((client) => [client.name, client.note.split(',').at(-1).trim()]));
  assert.ok(proof.testimonials.length >= 3);
  for (const item of proof.testimonials) assert.equal(item.country, wall.get(item.company), `${item.company}: ${item.country}`);
});

test('existing stand-ins with the person\'s own country are corrected on the next run; edits otherwise kept', () => {
  const proof = made();
  const existing = { ...proof, testimonials: proof.testimonials.map((item, index) => ({ ...item, country: ['France', 'United Kingdom', 'Japan'][index % 3], quote: `${item.quote} (edited)` })) };
  const next = withFacts(existing, proof, new Set(['/bikini-manufacturer/']));
  assert.deepEqual(next.testimonials.map((item) => item.country), proof.testimonials.map((item) => item.country));
  assert.ok(next.testimonials.every((item) => item.quote.endsWith('(edited)')), 'the testimonials are kept, only their country follows the wall');
  // A service trade's note is the country alone.
  const service = withFacts({ ...existing, clients: [{ name: proof.testimonials[0].company, note: 'Canada' }] }, { ...proof, clientsFor: undefined }, new Set(['/bikini-manufacturer/']));
  assert.equal(service.testimonials[0].country, 'Canada');
});
