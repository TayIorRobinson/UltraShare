const fs = require("fs")
const speakeasy = require("speakeasy")
const rateLimit = require("express-rate-limit")

const allowedCharsRegex =new RegExp("^[" + global.config.fileName.allowedChars + "]+$")

function randomString(length, chars) {
    var result = '';
    for (var i = length; i > 0; --i) result += chars[Math.floor(Math.random() * chars.length)];
    return result;
}
function getID(req) {
    if (req.header("id") && !allowedCharsRegex.test(req.header("id").toString())) {
        if (!global.fileDB.get({id: req.header("id")})) {
            return req.header("id")
        }
    }
    while (true) {
        id = randomString(global.config.fileName.length,global.config.fileName.allowedChars)
        if (!global.fileDB.get({id: id})) {
            return id
        }
    }
}

module.exports = function(app) {
    app.use("/api/", rateLimit({
        windowMs: 60 * 1000, 
        max: 60,
        message:
            "Slow down there, bucko! You can only send 60 API requests a minute."
    }));
    app.post("/api/login", rateLimit({
        windowMs: 15 * 60 * 1000, 
        max: 5,
        message:
          "You have been ratelimited from logging in. Either wait 15 minutes, or restart the server."
      }), function(req,res) {
        var data = ""
        req.on("data", function(d) {data += d})
        req.on("end", function() {
            var j = JSON.parse(data)
            if (j.username == global.config.username) {
                var valid = speakeasy.totp.verify({ secret: global.config.totpSecret,
                    encoding: 'base32',
                    token: j.totp })
                if (valid) {
                    res.send(global.config.apiKey)
                } else {
                    res.status(401)
                    res.send("invalid totp code")
                }
            } else {
                res.status(401)
                res.send("invalid username")
            }
        })
    })
    app.get("/api/getUsername", function(req,res) {
        console.log("[API]",req.ip, req.url, req.header("User-Agent"))
        var auth = req.header("Authorization") || req.header("authorization")
        if (global.config.apiKey == auth) {
            res.send(global.config.username)
        } else {
            res.status(401)
            res.send("invalid api key")
        }
    })

    app.get("/api/get", function(req,res) {
        console.log("[API]",req.ip, req.url, req.header("User-Agent"))
        var auth = req.header("Authorization") || req.header("authorization")
        if (global.config.apiKey == auth) {
            res.set({"Content-Type": "application/json"}) 
            res.send(JSON.stringify(global.fileDB.get({})))
        } else {
            res.status(401)
            res.send("invalid api key")
        }
    })
    app.get("/api/delete/:id", function(req,res) {
        console.log("[API]",req.ip, req.url, req.header("User-Agent"))
        var auth = req.header("Authorization") || req.header("authorization")
        if (global.config.apiKey == auth) {
            res.set({"Content-Type": "application/json"}) 
            var item = global.fileDB.get({id: req.params.id})
            if (item) {
                global.fileDB.remove(item)
                if(item.file) {
                    try {
                        fs.unlinkSync("./files/" + item.file)
                    } catch(e){}
                }
                global.fileDB.save()
                res.send("ok! deleted file with id " + item.id)
            } else {
                res.status(404)
                res.send("not found")
            }
        } else {
            res.status(401)
            res.send("invalid api key")
        }
    })
    app.get("/api/change/:id/:newid", function(req,res) {
        console.log("[API]",req.ip, req.url, req.header("User-Agent"))
        var auth = req.header("Authorization") || req.header("authorization")
        if (global.config.apiKey == auth) {
            if (!allowedCharsRegex.test(req.params.newid.toString())) {
                 res.status(400)
                 return res.send("invalid characters in url, allowed characters: " + global.config.fileName.allowedChars)
            }
            var item = global.fileDB.get({id: req.params.id})
            var itemNew = global.fileDB.get({id: req.params.newid})
            if (item && !itemNew) {
                global.fileDB.update(item,{id: req.params.newid})
                global.fileDB.save()
                res.send("ok! " + req.params.id + " is now " + req.params.newid)
            } else {
                res.status(404)
                res.send("not found, or new id is taken")
            }
        } else {
            res.status(401)
            res.send("invalid api key")
        }
    })
    app.post("/api/upload", function(req,res) {
        console.log("[API]",req.ip, req.url, req.header("User-Agent"))
        var auth = req.header("Authorization") || req.header("authorization")
        if (global.config.apiKey == auth) {
            var id = getID(req)
            var ext = req.header("fileext")
            if (ext.includes(".")) {
                ext = ext.split(".")[1]
            }
            var stream = fs.createWriteStream("./files/" + id + "." + ext)
            req.pipe(stream)
            req.on("end", function() {
                global.fileDB.add({
                    type:"file",
                    id:id,
                    file:id + "." + ext,
                    date: new Date(),
                    ua:req.header("User-Agent")})
                global.fileDB.save()
                res.send(JSON.stringify({
                    id: id,
                    url: req.protocol + "://" + req.header("Host") + "/" + id + "." + ext
                }))
            })
        } else {
            res.status(401)
            res.send("invalid api key")
        }
    })
    app.post("/api/shorten", function(req,res) {
        console.log("[API]",req.ip, req.url, req.header("User-Agent"))
        var auth = req.header("Authorization") || req.header("authorization")
        if (global.config.apiKey == auth) {
            var id = getID(req)
            var link = ""
            req.on("data", function(d) {
                link += d
            })
            req.on("end", function() {
                global.fileDB.add({
                    type:"link",
                    id:id,
                    redir:link,
                    date: new Date(),
                    ua:req.header("User-Agent")})
                global.fileDB.save()
                res.send(JSON.stringify({
                    id: id,
                    url: req.protocol + "://" + req.header("Host") + "/" + id
                }))
            })
        } else {
            res.status(401)
            res.send("invalid api key")
        }
    })
    app.get("/api/brew", function(req,res) {
        res.status(418)
        res.send("I'm a teapot.")
    })
}