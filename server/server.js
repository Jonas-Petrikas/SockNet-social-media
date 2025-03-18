import express from 'express';
import mysql from 'mysql';
import cors from 'cors';
import md5 from 'md5';
import cookieParser from 'cookie-parser';
import { v4 } from 'uuid';

const postsPerPage = 7;

const app = express();
const port = 3333;
const frontURL = 'http://localhost:5173';
const serverURL = `http://localhost:${port}/`;

app.use(cookieParser());

app.use(cors(
    {
        origin: frontURL,
        credentials: true
    }
));

app.use(express.json());

const con = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'sock_net'
});

con.connect(err => {
    if (err) {
        console.log('Klaida prisijungiant prie DB');
        return;
    }
    console.log('Prisijungimas prie DB buvo sėkmingas');
});

const error500 = (res, err) => res.status(500).json(err);

//Identifikacija - pagal numatytą ID identifikuojam vartotoją pvz Ragana-su-šluota
//Autorizacija - pagal vartotojo identifikuotą ID, vartotojui suteikiamos teisės - gali balsuoti, pirkti, keisti, etc.
//Autentifikacija - pagal numatytą ID autentifikuojam vartotoją, pvz Arvydas Kijakauskas, a/k 55555555

// auth middleware
app.use((req, res, next) => {
    const token = req.cookies['sock-net-token'] || 'no-token';

    const sql = `
    SELECT u.id, u.role, u.name
    FROM sessions AS s
    INNER JOIN users AS u
    ON s.user_id = u.id
    WHERE token = ?
    `


    con.query(sql, [token], (err, result) => {
        if (err) return error500(res, err);
        if (result.length === 0) {
            req.user = {
                role: 'guest',
                name: 'Guest',
                id: 0
            }
        } else {
            req.user = {
                role: result[0].role,
                name: result[0].name,
                id: result[0].id
            }
        }
        next();
    });
});





app.post('/login', (req, res) => {
    const { name, password } = req.body;
    const sql = 'SELECT * FROM users WHERE name = ? AND password = ?';
    con.query(sql, [name, md5(password)], (err, result) => {
        if (err) return error500(res, err);
        if (result.length === 0) {
            res.status(401).send({
                msg: { type: 'error', text: 'Invalid username or password' }
            });
            return;
        }
        const token = md5(v4());
        const userId = result[0].id;
        let time = new Date();

        time = time.setMinutes(time.getMinutes() + (60 * 24));
        time = new Date(time);

        const insertSql = `
        INSERT INTO sessions
        (user_id, token, valid_until)
        VALUES (?, ?, ?)

        `

        con.query(insertSql, [userId, token, time], (err) => {
            if (err) return error500(res, err);
            res.cookie('sock-net-token', token, { httpOnly: true, SameSite: 'none' });
            res.status(200).json({
                msg: { type: 'success', text: `Hello, ${result[0].name}! How are you?` },
                user: {
                    role: result[0].role,
                    name: result[0].name,
                    id: result[0].id
                }
            });
        });
    });
});


//TODO paimti iš middleware
app.get('/auth-user', (req, res) => {
    setTimeout(_ => {
        const token = req.cookies['r2-token'] || 'no-token';
        const sql = 'SELECT * FROM users WHERE session_id = ?';
        con.query(sql, [token], (err, result) => {
            if (err) {
                res.status(500).send('Klaida bandant prisijungti');
                return;
            }
            if (result.length === 0) {
                res.status(200).json({
                    role: 'guest',
                    name: 'Guest',
                    id: 0
                });
                return;
            }
            res.status(200).json({
                role: result[0].role,
                name: result[0].name,
                id: result[0].id
            });
        });
    }, 1000);
});


app.post('/logout', (req, res) => {
    setTimeout(_ => {
        const token = req.cookies['r2-token'] || 'no-token';
        console.log('logout', token);
        const sql = 'UPDATE users SET session_id = ? WHERE session_id = ?';
        con.query(sql, [null, token], (err) => {
            if (err) {
                res.status(500).send('Klaida bandant atsijungti');
                return;
            }
            res.clearCookie('r2-token');
            res.status(200).json({
                success: true,
                message: 'Atsijungimas sėkmingas',
                user: {
                    role: 'guest',
                    name: 'Guest',
                    id: 0
                }
            });
        });
    }, 2000);
});







//USERS
app.get('/users/active-list', (req, res) => {

    const sql = `
    SELECT id, name, avatar, role, online
    FROM users
    -- WHERE role <> 'bot'
    ORDER BY online DESC, name
    `;

    //  
    //   WHERE role = 'gold'
    con.query(sql, (err, result) => {
        if (err) return error500(res, err);
        res.json({
            success: true,
            db: result
        });
    });
});

//POSTS
app.get('/posts/load-posts/:page', (req, res) => {
    const page = parseInt(req.params.page);

    const sql = `
   SELECT p.id, p.content, p.created_at AS postDate, p.votes, u.name, u.avatar, i.url AS mainImage
    FROM posts AS p
    INNER JOIN users AS u
    ON u.id = p.user_id
    INNER JOIN images AS i
    ON p.id = i.post_id AND i.main = 1
    ORDER BY p.created_at DESC
    LIMIT ? OFFSET ?
    `;



    con.query(sql, [postsPerPage, (page - 1) * postsPerPage], (err, result) => {
        if (err) return error500(res, err);
        result = result.map(r => ({ ...r, votes: JSON.parse(r.votes) }));
        res.json({
            success: true,
            db: result
        });
    });
});



// Start server


app.listen(port, () => {
    console.log(`Serveris pasiruošęs ir laukia ant ${port} porto!`);
});