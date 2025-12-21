const themeBtn = document.getElementById('theme-toggle');
const themeIcon = themeBtn.querySelector('i');

const currentTheme = localStorage.getItem('theme');
if (currentTheme === 'dark') {
    document.body.setAttribute('data-theme', 'dark');
    themeIcon.classList.remove('fa-moon');
    themeIcon.classList.add('fa-sun');
}

themeBtn.addEventListener('click', () => {
    if (document.body.getAttribute('data-theme') === 'dark') {
        document.body.removeAttribute('data-theme');
        themeIcon.classList.remove('fa-sun');
        themeIcon.classList.add('fa-moon');
        localStorage.setItem('theme', 'light');
    } else {
        document.body.setAttribute('data-theme', 'dark');
        themeIcon.classList.remove('fa-moon');
        themeIcon.classList.add('fa-sun');
        localStorage.setItem('theme', 'dark');
    }
});

function goToForm(category) {
    console.log("Selected:", category);
    const safeCategory = encodeURIComponent(category);
    window.location.href = `complaint_form.html?category=${safeCategory}`;
}

// --- 1. DYNAMIC PAGE CONTENT (The Code You Asked For) ---
        const categoryData = {
            "Academics": {
                title: "Academic Issues",
                desc: "Issues related to Classes, Lectures, or Faculty behavior.",
                image: "Imges/Department.jpeg",
                dept: "Academic Section",
                email: "academics@awkum.edu.pk"
            },
            "Hostel": {
                title: "Hostel Facilities",
                desc: "Report issues regarding Room allotment, Water, or Mess.",
                image: "Imges/hostel.jpg",
                dept: "Provost Office",
                email: "provost@awkum.edu.pk"
            },
            "Transport": {
                title: "Transport Services",
                desc: "Bus late arrivals, route complaints, or driver behavior.",
                image: "Imges/transport (1)2.jpg",
                dept: "Transport Office",
                email: "transport@awkum.edu.pk"
            },
            "Cafeteria": {
                title: "Cafeteria & Food",
                desc: "Hygiene concerns, food quality, or overpricing.",
                image: "Imges/Cafeteria2.jpg",
                dept: "Administration",
                email: "admin@awkum.edu.pk"
            },
            "IT Support": {
                title: "IT & Wi-Fi Support",
                desc: "Login issues, slow internet, or portal errors.",
                image: "Imges/IT2.jpg",
                dept: "Directorate of IT",
                email: "it-support@awkum.edu.pk"
            },
            "Library": {
                title: "Library Services",
                desc: "Book availability, noise complaints, or digital access.",
                image: "Imges/Library2.png",
                dept: "Chief Librarian",
                email: "library@awkum.edu.pk"
            },
            "Cleanliness": {
                title: "Campus Cleanliness",
                desc: "Washroom hygiene, trash bins, or general cleaning.",
                image: "Imges/clean2.jpg",
                dept: "Estate Office",
                email: "estate@awkum.edu.pk"
            },
            "Other": {
                title: "General Complaints",
                desc: "Any other issues not listed above.",
                image: "Imges/Others.jpg",
                dept: "Student Affairs",
                email: "studentaffairs@awkum.edu.pk"
            }
        };

        // Get Category from URL
        const params = new URLSearchParams(window.location.search);
        const currentCategory = params.get('category');
        const selectBox = document.getElementById('category');

        // Apply Logic if category exists
        if (currentCategory && categoryData[currentCategory]) {
            const data = categoryData[currentCategory];

            // 1. Update Text
            document.getElementById('page-title').innerText = data.title;
            document.getElementById('page-desc').innerText = data.desc;
            
            // 2. Update Contact Box
            document.getElementById('contact-display').style.display = 'inline-block';
            document.getElementById('dept-name').innerText = data.dept;
            document.getElementById('dept-email').innerText = data.email;

            // 3. Update Background Image (Keeping the gradient overlay for readability)
            const heroBanner = document.getElementById('hero-banner');
            heroBanner.style.backgroundImage = `linear-gradient(rgba(189, 36, 38, 0.8), rgba(64, 64, 64, 0.8)), url('${data.image}')`;

            // 4. Auto-select the dropdown option
            // Note: We need to match the select option values to the URL category
            // We do a rough match here
            for(let i=0; i<selectBox.options.length; i++){
                if(selectBox.options[i].value === currentCategory || selectBox.options[i].text.includes(currentCategory)){
                    selectBox.selectedIndex = i;
                    break;
                }
            }

        } else {
            // Default View
            document.getElementById('page-title').innerText = "Report an Issue";
            document.getElementById('contact-display').style.display = 'none';
        }

        // --- 2. FEED & FORM LOGIC (Your Existing Code) ---
        
        // Load Feed on start
        document.addEventListener('DOMContentLoaded', loadFeed);

        // Submit Form
        document.getElementById('issueForm').addEventListener('submit', function(e) {
            e.preventDefault();
            const category = document.getElementById('category').value;
            const location = document.getElementById('location').value;
            const desc = document.getElementById('desc').value;

            const newComplaint = {
                id: Date.now(),
                category: category,
                location: location,
                description: desc,
                status: "Pending",
                date: new Date().toLocaleDateString()
            };

            let complaints = JSON.parse(localStorage.getItem('awkumComplaints')) || [];
            complaints.push(newComplaint);
            localStorage.setItem('awkumComplaints', JSON.stringify(complaints));

            document.getElementById('issueForm').reset();
            alert("Report Submitted Successfully!");
            loadFeed(); 
        });

        // Load Feed Function
        function loadFeed() {
            const feedContainer = document.getElementById('feed-container');
            const complaints = JSON.parse(localStorage.getItem('awkumComplaints')) || [];
            
            feedContainer.innerHTML = "";

            if (complaints.length === 0) {
                feedContainer.innerHTML = "<p style='text-align:center; opacity:0.7;'>No reports yet.</p>";
                return;
            }

            // Show newest first
            complaints.slice().reverse().forEach(issue => {
                const cardHTML = `
                    <div class="issue-card">
                        <div class="tag ${issue.category.split(' ')[0]}">${issue.category}</div>
                        <h3>${issue.location}</h3>
                        <p>${issue.description}</p>
                        <div class="meta">
                            <span><i class="fas fa-clock"></i> ${issue.date}</span>
                            <span class="status ${issue.status}">${issue.status}</span>
                        </div>
                    </div>
                `;
                feedContainer.innerHTML += cardHTML;
            });
        }


