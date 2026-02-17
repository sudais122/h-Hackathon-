
app.get('/api/complaints/:id', (req, res) => {
    const id = req.params.id;
    // Assuming you are using NeDB (db.find or db.findOne)
    db.findOne({ _id: id }, (err, doc) => {
        if (err || !doc) {
            return res.status(404).send("Complaint not found");
        }
        res.json(doc);
    });
});