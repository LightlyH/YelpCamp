var express = require("express");
var router  = express.Router();
var Campground = require("../models/campground");
var middleware = require("../middleware");
var NodeGeocoder = require('node-geocoder');
var multer = require('multer');
var storage = multer.diskStorage({
  filename: function(req, file, callback) {
    callback(null, Date.now() + file.originalname);
  }
});
var imageFilter = function (req, file, cb) {
    // accept image files only
    if (!file.originalname.match(/\.(jpg|jpeg|png|gif)$/i)) {
        return cb(new Error('Only image files are allowed!'), false);
    }
    cb(null, true);
};
var upload = multer({ storage: storage, fileFilter: imageFilter})

var cloudinary = require('cloudinary');
cloudinary.config({ 
  cloud_name: 'dzuetkwyj', 
  api_key: process.env.CLOUDINARY_API_KEY, 
  api_secret: process.env.CLOUDINARY_API_SECRET
});

 
var options = {
  provider: 'google',
  httpAdapter: 'https',
  apiKey: process.env.GEOCODER_API_KEY,
  formatter: null
};
 
var geocoder = NodeGeocoder(options);

// INDEX - show all campgrounds
router.get("/", function (req, res) {
        var perPage = 8;
        var pageQuery = parseInt(req.query.page);
        var pageNumber = pageQuery ? pageQuery : 1;
        var noMatch = null;
        if(req.query.search) {
            // 但第二页或更多页的search结果没有办法implement...不会，待查
            const regex = new RegExp(escapeRegex(req.query.search), 'gi');
            Campground.find({name: regex}).skip((perPage * pageNumber) - perPage).limit(perPage).exec(function (err, allCampgrounds) {
                Campground.count().exec(function (err, count) {
                    if (err) {
                        console.log(err);
                    } else {
                        if(allCampgrounds.length < 1) {
                            noMatch = "No campgrounds match that query, please try again.";
                        }
                        res.render("campgrounds/index", {
                            campgrounds: allCampgrounds,
                            noMatch: noMatch,
                            current: pageNumber,
                            pages: Math.ceil(count / perPage)
                        });
                    }
                });
            });
        } else {
            Campground.find({}).skip((perPage * pageNumber) - perPage).limit(perPage).exec(function (err, allCampgrounds) {
                Campground.count().exec(function (err, count) {
                    if (err) {
                        console.log(err);
                    } else {
                        res.render("campgrounds/index", {
                            campgrounds: allCampgrounds,
                            noMatch: noMatch,
                            current: pageNumber,
                            pages: Math.ceil(count / perPage)
                        });
                    }
                });
            });
    
        }
});


// NEW - show form to create new campground
router.get("/new", middleware.isLoggedIn, function(req, res) {
    res.render("campgrounds/new");
});


// SHOW - shows more info about one campground
router.get("/:id", function(req, res) {
    // find the campground with provided ID
    Campground.findById(req.params.id).populate("comments").exec(function(err, foundCampground) {
        if (err || !foundCampground) {
            req.flash("error", "Campground not found");
            res.redirect("back");
        } else {
          console.log(foundCampground);
          // render show template with that campground
          res.render("campgrounds/show", {campground: foundCampground});
        }
    });
    // res.send("This will be the show page one day!");
});

//CREATE - add new campground to DB
router.post("/", middleware.isLoggedIn, upload.single('image'), function(req, res) {
// router.post("/", middleware.isLoggedIn, function(req, res){
    cloudinary.v2.uploader.upload(req.file.path, function(err, result) {
        if (err) {
           req.flash("error", err.message);
           return res.redirect("back");
        }
          // add cloudinary url for the image to the campground object under image property
          var image = result.secure_url; 
          // add image's public_id to campground object
          var imageId = result.public_id;
          
          // get data from form and add to campgrounds array
          var name = req.body.name;
          //  var image = req.body.image;
          var price = req.body.price;
          var desc = req.body.description;
          var author = {
              id: req.user._id,
              username: req.user.username
          };
          geocoder.geocode(req.body.location, function (err, data) {
                if (err || !data.length) {
                  req.flash('error', 'Invalid address');
                  return res.redirect('back');
                }
                var lat = data[0].latitude;
                var lng = data[0].longitude;
                var location = data[0].formattedAddress;
                var newCampground = {name: name, image: image, imageId: imageId, description: desc, author:author, price: price, location: location, lat: lat, lng: lng};
                // Create a new campground and save to DB
                // eval(require("locus"));
                Campground.create(newCampground, function(err, newlyCreated){
                    if(err){
                        console.log(err);
                    } else {
                        //redirect back to campgrounds page
                        console.log(newlyCreated);
                        res.redirect("/campgrounds");
                    }
                });
          });
        
    });

});


// EDIT CAMPGROUND ROUTE
router.get("/:id/edit", middleware.checkCampgroundOwnership, function(req, res) {
    Campground.findById(req.params.id, function(err, foundCampground) {
        // 默认res.render()会去views文件夹里找！render是render template，所以参数是文件名；而res.redirect()参数是网页地址～！
        res.render("campgrounds/edit", {campground: foundCampground});
    });
});

// UPDATE CAMPGROUND ROUTE
router.put("/:id", middleware.checkCampgroundOwnership, upload.single('image'), function(req, res) {
// router.put("/:id", middleware.checkCampgroundOwnership, function(req, res){
// a better version see: https://github.com/nax3t/image_upload_example/blob/edit-delete/routes/campgrounds.js
    Campground.findById(req.params.id, async function(err, campground){
        if(err){
            req.flash("error", err.message);
            res.redirect("back");
        } else {
            if (req.file) {
                try {
                    await cloudinary.v2.uploader.destroy(campground.imageId);
                    var result = await cloudinary.v2.uploader.upload(req.file.path);
                    campground.imageId = result.public_id;
                    campground.image = result.secure_url;
                } catch (err) {
                    req.flash("error", err.message);
                    return res.redirect("back");
                }
                // cloudinary.v2.uploader.destroy(campground.imageId);/*, function(err) {*/
                    // if (err) {
                    //     req.flash("error", err.message);
                    //     return res.redirect("back");
                    // }
                // cloudinary.v2.uploader.upload(req.file.path);/*, function(err, result) {*/
                        // if (err) {
                        //     req.flash("error", err.message);
                        //     return res.redirect("back");
                        // } 
                // campground.imageId = result.public_id;
                // campground.image = result.secure_url;
                //     });
                // });
            } 
            campground.name = req.body.name;
            campground.description = req.body.description;
            campground.price = req.body.price;
            
            geocoder.geocode(req.body.location, function(err, data) {
                if (err || !data.length) {
                  req.flash('error', 'Invalid address'); // gotcha!!!
                  return res.redirect('back');
                }
                // req.body.campground.lat = data[0].latitude;
                // req.body.campground.lng = data[0].longitude;
                // req.body.campground.location = data[0].formattedAddress;
                campground.lat = data[0].latitude;
                campground.lng = data[0].longitude;
                campground.location = data[0].formattedAddress;
                // Campground.findByIdAndUpdate(req.params.id, req.body.campground, function(err, campground){
                    // if(err){
                    //     req.flash("error", err.message);
                    //     res.redirect("back");
                    // } else {
                // req.flash("success","Successfully Updated!");
                // res.redirect("/campgrounds/" + campground._id);
                //     }
                // });
            });
            
            campground.save();
            req.flash("success","Successfully Updated!");
            res.redirect("/campgrounds/" + campground._id);
        }
    });
 
});

// DESTROY CAMPGROUND ROUTE 
router.delete("/:id", middleware.checkCampgroundOwnership, function(req, res) {
    // Campground.findByIdAndRemove(req.params.id, function(err) {
    //     if (err) {
    //         res.redirect("/campgrounds");
    //     } else {
    //         res.redirect("/campgrounds");
    //     }
    // });
    Campground.findById(req.params.id, async function(err, campground) {
        if (err) {
          req.flash("error", err.message);
          return res.redirect("back");
        }
        try {
            await cloudinary.v2.uploader.destroy(campground.imageId);
            campground.remove();
            req.flash('success', 'Campground deleted successfully!');
            res.redirect('/campgrounds');
        } catch (err) {
            if (err) {
              req.flash("error", err.message);
              return res.redirect("back");
            }
        }
    });
});

function escapeRegex(text) {
    return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
}; 

module.exports = router;