/**
 * E2E Tests: CRM Features
 *
 * Tests CRM-related functionality:
 * - Contact CRUD (create, read, update, delete)
 * - Contact search and filtering
 * - Bulk contact import
 * - Tag management (create, assign, remove)
 * - Conversation listing, assignment, and status
 * - Contact-conversation linking
 */
import { ApiClient } from '../helpers/api-client';
import { describeServerlessAcceptance } from '../helpers/acceptance';

describeServerlessAcceptance('CRM Features', () => {
    let client: ApiClient;

    beforeAll(() => {
        client = new ApiClient();
    });

    describe('Contact CRUD', () => {
        let contactId: string;

        it('should create a contact', async () => {
            const res = await client.createCrmContact({
                name: 'John Doe',
                phone: '+1555000001',
                email: 'john@example.com',
                company: 'Acme Corp',
                notes: 'VIP customer',
            });
            expect(res.status).toBe(201);
            expect(res.data).toHaveProperty('id');
            expect(res.data.name).toBe('John Doe');
            expect(res.data.phone).toBe('+1555000001');
            contactId = res.data.id;
        });

        it('should create a contact with minimal fields', async () => {
            const res = await client.createCrmContact({
                name: 'Minimal Contact',
                phone: '+1555000002',
            });
            expect(res.status).toBe(201);
            expect(res.data).toHaveProperty('id');
            // Cleanup
            if (res.data.id) await client.deleteCrmContact(res.data.id);
        });

        it('should reject contact without required phone', async () => {
            const res = await client.createCrmContact({
                name: 'No Phone',
            });
            expect([400, 422]).toContain(res.status);
        });

        it('should get contact by ID', async () => {
            const res = await client.getCrmContact(contactId);
            expect(res.status).toBe(200);
            expect(res.data.id).toBe(contactId);
            expect(res.data.name).toBe('John Doe');
            expect(res.data.email).toBe('john@example.com');
        });

        it('should return 404 for non-existent contact', async () => {
            const res = await client.getCrmContact('non-existent-contact-id');
            expect(res.status).toBe(404);
        });

        it('should update contact', async () => {
            const res = await client.updateCrmContact(contactId, {
                name: 'John Doe Updated',
                company: 'New Corp',
            });
            expect(res.status).toBe(200);
            expect(res.data.name).toBe('John Doe Updated');
            expect(res.data.company).toBe('New Corp');
            // Unchanged fields preserved
            expect(res.data.phone).toBe('+1555000001');
        });

        it('should list contacts', async () => {
            const res = await client.listCrmContacts();
            expect(res.status).toBe(200);
            const contacts = res.data.data || res.data;
            expect(Array.isArray(contacts)).toBe(true);
            expect(contacts.length).toBeGreaterThanOrEqual(1);
        });

        it('should filter contacts by search query', async () => {
            const res = await client.listCrmContacts({ search: 'John' });
            expect(res.status).toBe(200);
            const contacts = res.data.data || res.data;
            expect(contacts.length).toBeGreaterThanOrEqual(1);
            expect(contacts.some((c: any) => c.name.includes('John'))).toBe(true);
        });

        it('should paginate contacts', async () => {
            const res = await client.listCrmContacts({ limit: 1, offset: 0 });
            expect(res.status).toBe(200);
            const contacts = res.data.data || res.data;
            expect(contacts.length).toBeLessThanOrEqual(1);
        });

        it('should delete contact', async () => {
            const res = await client.deleteCrmContact(contactId);
            expect([200, 204]).toContain(res.status);
        });

        it('should return 404 after deletion', async () => {
            const res = await client.getCrmContact(contactId);
            expect(res.status).toBe(404);
        });
    });

    describe('Bulk Contact Import', () => {
        const importedIds: string[] = [];

        it('should import multiple contacts at once', async () => {
            const res = await client.importCrmContacts({
                contacts: [
                    { name: 'Import One', phone: '+1555100001' },
                    { name: 'Import Two', phone: '+1555100002' },
                    { name: 'Import Three', phone: '+1555100003' },
                ],
            });
            expect([200, 201]).toContain(res.status);
            expect(res.data).toHaveProperty('imported');
            expect(res.data.imported).toBeGreaterThanOrEqual(3);
            if (res.data.ids) {
                importedIds.push(...res.data.ids);
            }
        });

        it('should handle duplicate phone numbers gracefully', async () => {
            const res = await client.importCrmContacts({
                contacts: [
                    { name: 'Duplicate', phone: '+1555100001' },
                ],
            });
            // Should either skip, update, or return conflict info
            expect([200, 201, 409]).toContain(res.status);
        });

        it('should reject empty import', async () => {
            const res = await client.importCrmContacts({ contacts: [] });
            expect([400, 422]).toContain(res.status);
        });

        afterAll(async () => {
            for (const id of importedIds) {
                await client.deleteCrmContact(id);
            }
        });
    });

    describe('Tag Management', () => {
        let tagId: string;
        let contactId: string;

        beforeAll(async () => {
            const contactRes = await client.createCrmContact({
                name: 'Tag Test Contact',
                phone: '+1555200001',
            });
            contactId = contactRes.data.id;
        });

        it('should create a tag', async () => {
            const res = await client.createCrmTag({
                name: 'VIP',
                color: '#ff0000',
            });
            expect(res.status).toBe(201);
            expect(res.data).toHaveProperty('id');
            expect(res.data.name).toBe('VIP');
            tagId = res.data.id;
        });

        it('should create a tag without color', async () => {
            const res = await client.createCrmTag({ name: 'Lead' });
            expect(res.status).toBe(201);
            // Cleanup
            if (res.data.id) await client.deleteCrmTag(res.data.id);
        });

        it('should reject duplicate tag name', async () => {
            const res = await client.createCrmTag({ name: 'VIP' });
            expect([400, 409, 422]).toContain(res.status);
        });

        it('should list all tags', async () => {
            const res = await client.listCrmTags();
            expect(res.status).toBe(200);
            const tags = res.data.data || res.data;
            expect(Array.isArray(tags)).toBe(true);
            expect(tags.length).toBeGreaterThanOrEqual(1);
        });

        it('should assign tag to contact', async () => {
            const res = await client.updateCrmContact(contactId, {
                tags: [tagId],
            });
            expect(res.status).toBe(200);
            expect(res.data.tags).toContain(tagId);
        });

        it('should filter contacts by tag', async () => {
            const res = await client.listCrmContacts({ tagId });
            expect(res.status).toBe(200);
            const contacts = res.data.data || res.data;
            expect(contacts.length).toBeGreaterThanOrEqual(1);
        });

        it('should remove tag from contact', async () => {
            const res = await client.updateCrmContact(contactId, {
                tags: [],
            });
            expect(res.status).toBe(200);
            expect(res.data.tags || []).not.toContain(tagId);
        });

        it('should delete tag', async () => {
            const res = await client.deleteCrmTag(tagId);
            expect([200, 204]).toContain(res.status);
        });

        afterAll(async () => {
            if (contactId) await client.deleteCrmContact(contactId);
        });
    });

    describe('Conversation Management', () => {
        let contactId: string;
        let sessionId: string;

        beforeAll(async () => {
            const contactRes = await client.createCrmContact({
                name: 'Conversation Contact',
                phone: '+1555300001',
            });
            contactId = contactRes.data.id;

            const sessionRes = await client.createSession({
                name: `crm-conv-${Date.now()}`,
            });
            sessionId = sessionRes.data.id;
        });

        it('should list conversations', async () => {
            const res = await client.listCrmConversations();
            expect(res.status).toBe(200);
            const conversations = res.data.data || res.data;
            expect(Array.isArray(conversations)).toBe(true);
        });

        it('should filter conversations by status', async () => {
            const res = await client.listCrmConversations({ status: 'open' });
            expect(res.status).toBe(200);
        });

        it('should filter conversations by assignee', async () => {
            const res = await client.listCrmConversations({ assignedTo: 'unassigned' });
            expect(res.status).toBe(200);
        });

        it('should filter conversations by contact', async () => {
            const res = await client.listCrmConversations({ contactId });
            expect(res.status).toBe(200);
        });

        afterAll(async () => {
            if (sessionId) await client.deleteSession(sessionId);
            if (contactId) await client.deleteCrmContact(contactId);
        });
    });

    describe('Contact Deduplication', () => {
        let contact1Id: string;
        let contact2Id: string;

        it('should flag or merge contacts with same phone number', async () => {
            const res1 = await client.createCrmContact({
                name: 'First Entry',
                phone: '+1555400001',
            });
            expect(res1.status).toBe(201);
            contact1Id = res1.data.id;

            const res2 = await client.createCrmContact({
                name: 'Second Entry',
                phone: '+1555400001',
            });
            // Should either reject, merge, or allow with duplicate flag
            expect([201, 400, 409]).toContain(res2.status);
            if (res2.status === 201) {
                contact2Id = res2.data.id;
            }
        });

        afterAll(async () => {
            if (contact1Id) await client.deleteCrmContact(contact1Id);
            if (contact2Id) await client.deleteCrmContact(contact2Id);
        });
    });
});
