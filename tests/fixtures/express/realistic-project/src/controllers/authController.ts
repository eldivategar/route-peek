export function login(req: any, res: any) { res.json({ token: 'jwt' }); }
export function register(req: any, res: any) { res.status(201).json({}); }
export function getProfile(req: any, res: any) { res.json({}); }
