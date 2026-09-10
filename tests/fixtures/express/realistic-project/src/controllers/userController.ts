export function listUsers(req: any, res: any) { res.json([]); }
export function getUser(req: any, res: any) { res.json({}); }
export function createUser(req: any, res: any) { res.status(201).json({}); }
export function deleteUser(req: any, res: any) { res.status(204).end(); }
