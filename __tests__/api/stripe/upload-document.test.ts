/**
 * ID documents for a company account belong to its representative person;
 * `individual` is not valid on company accounts.
 */
import { POST } from '@/app/api/stripe/custom-account/[accountId]/upload-document/route';

const mockRetrieve = jest.fn();
const mockUpdate = jest.fn();
const mockFilesCreate = jest.fn();
const mockListPersons = jest.fn();
const mockUpdatePerson = jest.fn();
jest.mock('@/lib/stripe', () => ({
  stripe: {
    accounts: {
      retrieve: (...a: unknown[]) => mockRetrieve(...a),
      update: (...a: unknown[]) => mockUpdate(...a),
      listPersons: (...a: unknown[]) => mockListPersons(...a),
      updatePerson: (...a: unknown[]) => mockUpdatePerson(...a),
    },
    files: { create: (...a: unknown[]) => mockFilesCreate(...a) },
  },
}));

jest.mock('@/lib/db', () => {
  const sql = Object.assign(jest.fn().mockResolvedValue([]), { json: (v: unknown) => v });
  return { sql, queryOne: jest.fn().mockResolvedValue({ stripe_account_id: 'acct_1', documents: [] }) };
});

jest.mock('@/lib/community-auth', () => ({
  requireStripeAccountManager: jest.fn().mockResolvedValue({ ok: true }),
}));

const params = { params: Promise.resolve({ accountId: 'acct_1' }) };

function upload(documentType = 'identity_document') {
  const form = new FormData();
  form.append('file', new File([new Uint8Array([1, 2, 3])], 'id.png', { type: 'image/png' }));
  form.append('documentType', documentType);
  form.append('purpose', 'identity_document');
  return new Request('http://x/api/stripe/custom-account/acct_1/upload-document', {
    method: 'POST',
    body: form,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFilesCreate.mockResolvedValue({ id: 'file_1' });
  mockUpdate.mockResolvedValue({});
  mockUpdatePerson.mockResolvedValue({});
});

it('attaches an individual ID to the account', async () => {
  mockRetrieve.mockResolvedValue({ business_type: 'individual', metadata: { community_id: 'c1' }, requirements: {} });

  const res = await POST(upload(), params);

  expect(res.status).toBe(200);
  expect(mockUpdate).toHaveBeenCalledWith('acct_1', {
    individual: { verification: { document: { front: 'file_1' } } },
  });
});

it("attaches a company owner's ID to the representative", async () => {
  mockRetrieve.mockResolvedValue({ business_type: 'company', metadata: { community_id: 'c1' }, requirements: {} });
  mockListPersons.mockResolvedValue({ data: [{ id: 'person_1' }] });

  const res = await POST(upload(), params);

  expect(res.status).toBe(200);
  expect(mockUpdatePerson).toHaveBeenCalledWith('acct_1', 'person_1', {
    verification: { document: { front: 'file_1' } },
  });
  expect(mockUpdate).not.toHaveBeenCalled();
});

it('asks for personal details first when a company has no representative yet', async () => {
  mockRetrieve.mockResolvedValue({ business_type: 'company', metadata: { community_id: 'c1' }, requirements: {} });
  mockListPersons.mockResolvedValue({ data: [] });

  const res = await POST(upload(), params);

  expect(res.status).toBe(400);
  expect(mockFilesCreate).not.toHaveBeenCalled();
});

it('still attaches company documents to the company', async () => {
  mockRetrieve.mockResolvedValue({ business_type: 'company', metadata: { community_id: 'c1' }, requirements: {} });

  const res = await POST(upload('company_document'), params);

  expect(res.status).toBe(200);
  expect(mockUpdate).toHaveBeenCalledWith('acct_1', {
    company: { verification: { document: { front: 'file_1' } } },
  });
});
